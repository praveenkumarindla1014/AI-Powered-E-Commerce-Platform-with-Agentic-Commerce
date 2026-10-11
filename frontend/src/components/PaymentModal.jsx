import { useEffect, useState } from 'react';
import { verifyPayment } from '../api';
import { formatINR } from '../utils/format';

const METHOD_LABELS = { UPI: 'UPI', Card: 'Card', Netbanking: 'Netbanking', Wallet: 'Wallet', EMI: 'EMI' };
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank'];
const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];

/**
 * Built-in test checkout used when no Razorpay keys are configured.
 * It goes through the same server-side verification as a real payment.
 */
function PaymentModal({ order, failing = false, methods, emi, customer, onClose, onPaid, onFailed }) {
  const tabs = [...(methods?.length ? methods : ['UPI', 'Card', 'Netbanking', 'Wallet']), ...(emi?.eligible ? ['EMI'] : [])];
  const [method, setMethod] = useState(tabs[0]);
  const [upiId, setUpiId] = useState(customer?.upi_id || '');
  const [bank, setBank] = useState(BANKS[0]);
  const [wallet, setWallet] = useState(WALLETS[0]);
  const [step, setStep] = useState('select'); // select | processing | failed
  const [failure, setFailure] = useState(null);
  const amount = order.total;

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && step !== 'processing') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  const methodDetail = {
    UPI: `UPI · ${upiId}`,
    Card: 'Card · Visa •••• 1111',
    Netbanking: `Netbanking · ${bank}`,
    Wallet: `Wallet · ${wallet}`,
    EMI: `No-cost EMI · 3 × ${formatINR(emi?.emiAmount)}`,
  }[method];

  async function pay() {
    setStep('processing');
    await new Promise(r => setTimeout(r, 1200)); // feels like a real gateway round trip
    try {
      const result = await verifyPayment({
        orderId: order.id,
        paymentId: `pay_test_${Date.now().toString(36)}`,
        signature: failing ? 'mock_invalid_signature' : 'mock_valid_signature',
        method: methodDetail,
      });
      onPaid(result.order);
    } catch (err) {
      setFailure(err.data?.reason || err.message);
      setStep('failed');
      onFailed?.(err);
    }
  }

  const upiValid = /^[\w.-]{2,}@[a-z]{2,}$/i.test(upiId);

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && step !== 'processing') onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div className={`modal-header${failing ? ' danger' : ''}`}>
          <div>
            <h2 id="payment-title">{failing ? 'Failure simulation' : 'ShopMind Checkout'}</h2>
            <p>{failing ? 'This test card will be declined by the bank' : 'Secured test checkout · no real money moves'}</p>
          </div>
          {step !== 'processing' && <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>}
        </div>

        <div className="modal-amount">
          <div>
            <div className="small muted">Amount payable</div>
            <div className="price-lg accent">{formatINR(amount)}</div>
          </div>
          <div className="small muted" style={{ textAlign: 'right' }}>
            <div>{customer?.name}</div>
            <div>{customer?.phone}</div>
          </div>
        </div>

        {step === 'select' && !failing && (
          <div className="modal-tabs" role="tablist">
            {tabs.map((m, i) => (
              <button key={m} role="tab" aria-selected={method === m} className={`modal-tab${method === m ? ' active' : ''}`} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m]}{i === 0 && methods?.length > 0 && <span className="recommended-dot" title="Recommended for you" />}
              </button>
            ))}
          </div>
        )}

        <div className="modal-body">
          {step === 'select' && failing && (
            <div className="stack">
              <div>
                <label className="field-label">Test card</label>
                <input className="input mono" value="4000 0000 0000 0002" readOnly />
              </div>
              <div className="notice notice-error">
                <div>This card always fails, so you can see how ShopMind handles a declined payment without charging anyone.</div>
              </div>
              <button className="btn btn-danger btn-block btn-lg" onClick={pay}>Pay {formatINR(amount)}</button>
            </div>
          )}

          {step === 'select' && !failing && (
            <div className="stack">
              {method === 'UPI' && (
                <div>
                  <label className="field-label" htmlFor="upi">UPI ID</label>
                  <input id="upi" className="input" value={upiId} onChange={e => setUpiId(e.target.value.trim())} placeholder="name@bank" />
                  <p className="field-hint">A collect request will be sent to the UPI app linked to {customer?.phone}.</p>
                </div>
              )}
              {method === 'Card' && (
                <div className="stack">
                  <div>
                    <label className="field-label">Card number</label>
                    <input className="input mono" value="4111 1111 1111 1111" readOnly />
                  </div>
                  <div className="grid-2" style={{ gap: 10 }}>
                    <div><label className="field-label">Expiry</label><input className="input" value="12/30" readOnly /></div>
                    <div><label className="field-label">CVV</label><input className="input" value="123" readOnly /></div>
                  </div>
                  <p className="field-hint">Razorpay test card details are pre-filled.</p>
                </div>
              )}
              {method === 'Netbanking' && (
                <div>
                  <label className="field-label" htmlFor="bank">Bank</label>
                  <select id="bank" className="input" value={bank} onChange={e => setBank(e.target.value)}>
                    {BANKS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              )}
              {method === 'Wallet' && (
                <div>
                  <label className="field-label" htmlFor="wallet">Wallet</label>
                  <select id="wallet" className="input" value={wallet} onChange={e => setWallet(e.target.value)}>
                    {WALLETS.map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              )}
              {method === 'EMI' && (
                <div className="notice notice-accent">
                  <div>
                    <div className="notice-title">3-month no-cost EMI</div>
                    {formatINR(emi.emiAmount)} per month · ₹0 interest · total {formatINR(amount)}
                  </div>
                </div>
              )}
              <button className="btn btn-primary btn-block btn-lg" onClick={pay} disabled={method === 'UPI' && !upiValid}>
                {method === 'EMI' ? `Confirm EMI of ${formatINR(emi.emiAmount)}/mo` : `Pay ${formatINR(amount)}`}
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="loading-block" style={{ padding: '28px 0' }}>
              <span className="spinner spinner-lg" />
              <strong style={{ color: 'var(--text-primary)' }}>Processing payment…</strong>
              <span className="small">Waiting for the bank and verifying the payment signature</span>
            </div>
          )}

          {step === 'failed' && (
            <div className="stack" style={{ textAlign: 'center' }}>
              <div className="empty-state-icon" aria-hidden="true">⚠️</div>
              <h3>Payment couldn't be completed</h3>
              <p className="secondary">No money was charged. {failure}</p>
              <button className="btn btn-secondary btn-block" onClick={onClose}>Back to cart</button>
            </div>
          )}
        </div>

        <div className="modal-footer">🔒 Payment signature is verified on the server before the order is confirmed</div>
      </div>
    </div>
  );
}

export default PaymentModal;
