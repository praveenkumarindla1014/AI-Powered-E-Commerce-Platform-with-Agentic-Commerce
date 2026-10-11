import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/appContext';
import SuggestionPanel from '../components/SuggestionPanel';
import PaymentModal from '../components/PaymentModal';
import { EmptyState, Loading, PinForm, ProductImage, QtyStepper } from '../components/ui';
import {
  getSuggestion, acceptSuggestion, dismissSuggestion,
  createOrder, verifyPayment, reportPaymentFailure, pinPay, simulateFailure,
  getAbandonConfig, triggerAbandonedCart, getPaymentMethodSuggestion, getEmiSuggestion,
} from '../api';
import { formatINR, hasDiscount } from '../utils/format';
import { loadRazorpay } from '../utils/razorpay';

/** Small isolated component so the per-second tick doesn't re-render the whole cart. */
function IdleCountdown({ deadline }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return null;
  return <p className="small muted">If you step away, we'll save this cart for you in {seconds}s.</p>;
}

function Cart() {
  const {
    customer, cart, cartCount, cartSubtotal, cartDiscount, cartTotal, productsLoading,
    addToCart, setQuantity, removeFromCart, clearCart, reloadProducts, reloadCustomers,
    recoveryLinkId, showToast,
  } = useApp();
  const navigate = useNavigate();

  const [suggestion, setSuggestion] = useState(null); // { suggestion, product, blocked }
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [methods, setMethods] = useState(null);
  const [emi, setEmi] = useState(null);
  const [gateState, setGate] = useState(null); // { threshold, total, cartKey }
  const [checkout, setCheckout] = useState(null); // { order, failing }
  const [busy, setBusy] = useState(null); // 'checkout' | 'simulate' | 'pin'
  const [abandonConfig, setAbandonConfig] = useState(null);
  const [idleDeadline, setIdleDeadline] = useState(null);
  const [recovery, setRecovery] = useState(null);

  const cartKey = cart.map(l => `${l.id}:${l.quantity}`).join(',');
  // Latest cart for async callbacks (timers, debounced requests)
  const cartRef = useRef(cart);
  useLayoutEffect(() => { cartRef.current = cart; }, [cart]);

  // A payment-gate confirmation only applies to the exact cart it was shown for
  const gate = gateState?.cartKey === cartKey ? gateState : null;

  // ---------- AI cross-sell suggestion ----------
  useEffect(() => {
    if (!customer || cartRef.current.length === 0) {
      setSuggestion(null);
      return undefined;
    }
    let cancelled = false;
    setSuggestionLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await getSuggestion(customer.id, cartRef.current, dismissedIds);
        if (cancelled) return;
        setSuggestion(data.suggestion || data.blocked ? data : null);
        if (data.product && hasDiscount(data.product)) {
          showToast('discount', `${data.product.discount_percent}% off for you`, `${data.product.name} is on offer right now`);
        }
      } catch {
        if (!cancelled) setSuggestion(null);
      } finally {
        if (!cancelled) setSuggestionLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [customer, cartKey, dismissedIds, showToast]);

  // ---------- Payment method order (once per customer) ----------
  useEffect(() => {
    if (!customer) return;
    getPaymentMethodSuggestion(customer.id).then(setMethods).catch(() => setMethods(null));
  }, [customer]);

  // ---------- EMI eligibility ----------
  useEffect(() => {
    if (!customer || cartTotal <= 0) {
      setEmi(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      getEmiSuggestion(cartTotal, customer.id).then(setEmi).catch(() => setEmi(null));
    }, 600);
    return () => clearTimeout(timer);
  }, [cartTotal, customer]);

  // ---------- Abandoned-cart recovery ----------
  useEffect(() => {
    getAbandonConfig().then(setAbandonConfig).catch(() => setAbandonConfig(null));
  }, []);

  useEffect(() => {
    const idle = abandonConfig?.enabled && customer && cartRef.current.length > 0 && !checkout && !busy && !recovery && !recoveryLinkId;
    if (!idle) {
      setIdleDeadline(null);
      return undefined;
    }
    // Every cart change counts as activity and restarts the idle timer
    const timeoutMs = abandonConfig.timeout * 1000;
    setIdleDeadline(Date.now() + timeoutMs);
    const timer = setTimeout(async () => {
      setIdleDeadline(null);
      try {
        const data = await triggerAbandonedCart(customer.id, cartRef.current);
        if (data.success) {
          setRecovery(data);
          showToast('info', 'We saved your cart', 'Use the recovery link to finish your order anytime in the next 24 hours.');
        }
      } catch {
        // Recovery is best-effort; never interrupt the shopper
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [abandonConfig, customer, cartKey, checkout, busy, recovery, recoveryLinkId, showToast]);

  // ---------- Suggestion actions ----------
  async function handleAccept(_suggestion, product) {
    addToCart(product.id, 1, { silent: true });
    showToast('success', 'Added to cart', product.name);
    acceptSuggestion(customer.id, product.id, product.name).catch(() => {});
  }

  function handleDismiss(sugg) {
    setDismissedIds(prev => [...prev, sugg.suggestion_product_id]);
    dismissSuggestion(customer.id, sugg.suggestion_product_id, sugg.suggestion_name).catch(() => {});
  }

  // ---------- Payment ----------
  const handlePaid = useCallback(order => {
    setCheckout(null);
    setBusy(null);
    clearCart();
    reloadProducts();
    reloadCustomers();
    showToast('success', 'Payment successful', `Order ${order.id} · ${formatINR(order.total)}`);
    navigate(`/orders?placed=${encodeURIComponent(order.id)}`);
  }, [clearCart, reloadProducts, reloadCustomers, showToast, navigate]);

  async function openRazorpay(order, keyId) {
    const loaded = await loadRazorpay();
    if (!loaded) {
      setBusy(null);
      showToast('error', 'Checkout unavailable', 'Could not load Razorpay Checkout. Check your connection and try again.');
      return;
    }
    const rzp = new window.Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'ShopMind AI',
      description: `${cartCount} item${cartCount === 1 ? '' : 's'}`,
      prefill: { name: customer.name, contact: customer.phone?.replace(/\s/g, '') },
      theme: { color: '#E08A2E' },
      handler: async response => {
        try {
          const result = await verifyPayment({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            method: 'Razorpay Checkout',
          });
          handlePaid(result.order);
        } catch (err) {
          setBusy(null);
          showToast('error', 'Payment not confirmed', err.message);
        }
      },
      modal: {
        ondismiss: () => {
          setBusy(null);
          showToast('warning', 'Payment cancelled', 'Your cart is still here whenever you are ready.');
        },
      },
    });
    rzp.on('payment.failed', response => {
      reportPaymentFailure(order.id, response.error?.description).catch(() => {});
      showToast('error', 'Payment failed', "Payment couldn't be completed — no charge was made.");
    });
    rzp.open();
  }

  async function startCheckout(confirmed = false) {
    setBusy('checkout');
    try {
      const data = await createOrder(customer.id, cart, { confirmed, recoveryLinkId });
      if (data.requiresConfirmation) {
        setGate({ threshold: data.gate.threshold, total: data.total, cartKey });
        setBusy(null);
        return;
      }
      setGate(null);
      if (data.mock) {
        setCheckout({ order: data.order, failing: false });
        setBusy(null);
      } else {
        await openRazorpay(data.order, data.key_id);
      }
    } catch (err) {
      setBusy(null);
      showToast('error', "Couldn't start checkout", err.message);
      if (err.status === 409) reloadProducts();
    }
  }

  async function startFailureSimulation() {
    setBusy('simulate');
    try {
      const data = await simulateFailure(customer.id, cart);
      setCheckout({ order: data.order, failing: true });
    } catch (err) {
      showToast('error', 'Simulation error', err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePinPay(pin, resetPin) {
    setBusy('pin');
    try {
      const data = await pinPay(customer.id, cart, pin, { recoveryLinkId });
      handlePaid(data.order);
    } catch (err) {
      setBusy(null);
      resetPin();
      showToast('error', err.status === 401 ? 'Payment blocked' : 'Payment failed', err.message);
    }
  }

  // ---------- Render ----------
  if (productsLoading) return <div className="page"><Loading label="Loading your cart…" /></div>;

  if (cart.length === 0) {
    return (
      <div className="page">
        <EmptyState icon="🛒" title="Your cart is empty" action={<Link to="/" className="btn btn-primary">Browse products</Link>}>
          Add something you like and ShopMind will suggest what goes well with it.
        </EmptyState>
      </div>
    );
  }

  const firstMethod = methods?.methods?.[0];

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1>Your cart</h1>
          <p>{cartCount} item{cartCount === 1 ? '' : 's'} · shopping as {customer?.name}</p>
        </div>
        <Link to="/" className="btn btn-ghost">← Continue shopping</Link>
      </div>

      <div className="cart-layout">
        <div className="stack" style={{ gap: 18 }}>
          {recoveryLinkId && (
            <div className="notice notice-success">
              <div><div className="notice-title">Welcome back!</div>We restored the cart you saved earlier. It's ready for checkout.</div>
            </div>
          )}

          {recovery && (
            <div className="notice notice-info fade-in">
              <div className="grow">
                <div className="notice-title">Still deciding? We saved your cart.</div>
                Your {formatINR(recovery.cartTotal)} cart is saved for 24 hours. Open this link on any device to pick up where you left off:
                <div className="mono small" style={{ marginTop: 6, wordBreak: 'break-all' }}>
                  <a href={recovery.recoveryLink}>{recovery.recoveryLink}</a>
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {cart.map((line, index) => (
              <div key={line.id} className="cart-line" style={{ padding: 16, borderTop: index ? '1px solid var(--border-primary)' : 'none' }}>
                <Link to={`/product/${line.id}`} className="thumb"><ProductImage image={line.product.image} name={line.product.name} size={30} /></Link>
                <div className="grow">
                  <Link to={`/product/${line.id}`} className="cart-line-name">{line.product.name}</Link>
                  <div className="price-row small">
                    <span>{formatINR(line.unitPrice)}</span>
                    {hasDiscount(line.product) && (
                      <>
                        <span className="strike">{formatINR(line.product.price)}</span>
                        <span className="success-text">{line.product.discount_percent}% off</span>
                      </>
                    )}
                  </div>
                  {line.quantity >= line.product.stock && <span className="small" style={{ color: 'var(--warning)' }}>Max available</span>}
                </div>
                <QtyStepper value={line.quantity} max={line.product.stock} min={0} onChange={q => setQuantity(line.id, q)} />
                <span className="cart-line-total">{formatINR(line.lineTotal)}</span>
                <button className="btn btn-ghost" onClick={() => removeFromCart(line.id)} aria-label={`Remove ${line.product.name}`}>✕</button>
              </div>
            ))}
          </div>

          <SuggestionPanel
            loading={suggestionLoading}
            suggestion={suggestion?.suggestion}
            product={suggestion?.product}
            blocked={suggestion?.blocked}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
          />
        </div>

        {/* ===== Order summary ===== */}
        <aside className="sticky-panel stack" style={{ gap: 16 }}>
          <div className="card">
            <h2 style={{ marginBottom: 16 }}>Order summary</h2>
            <div className="stack-sm">
              <div className="summary-row"><span className="secondary">Items ({cartCount})</span><span>{formatINR(cartSubtotal)}</span></div>
              {cartDiscount > 0 && <div className="summary-row success-text"><span>Discounts</span><span>−{formatINR(cartDiscount)}</span></div>}
              <div className="summary-row"><span className="secondary">Delivery</span><span className="success-text">Free</span></div>
            </div>
            <hr className="divider" />
            <div className="summary-row summary-total"><span>Total</span><span>{formatINR(cartTotal)}</span></div>

            {emi?.eligible && (
              <div className="notice notice-accent" style={{ marginTop: 16 }}>
                <div>
                  <div className="notice-title">No-cost EMI available</div>
                  Pay {formatINR(emi.emiAmount)}/month for {emi.months} months. Choose EMI at checkout.
                </div>
              </div>
            )}

            {methods?.reordered && (
              <div style={{ marginTop: 16 }}>
                <div className="method-list">
                  {methods.methods.map((m, i) => <span key={m} className={`method-pill${i === 0 ? ' first' : ''}`}>{m}</span>)}
                </div>
                <p className="field-hint">✨ {methods.explainability}</p>
              </div>
            )}

            {gate ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <div className="notice notice-warning">
                  <div>
                    <div className="notice-title">Please confirm this payment</div>
                    {formatINR(gate.total)} is above the {formatINR(gate.threshold)} auto-approve limit, so we need your explicit go-ahead.
                  </div>
                </div>
                <button className="btn btn-primary btn-block btn-lg" onClick={() => startCheckout(true)} disabled={!!busy}>
                  {busy === 'checkout' ? 'Starting checkout…' : `Confirm & pay ${formatINR(gate.total)}`}
                </button>
                <button className="btn btn-ghost btn-block" onClick={() => setGate(null)} disabled={!!busy}>Not now</button>
              </div>
            ) : (
              <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} onClick={() => startCheckout(false)} disabled={!!busy}>
                {busy === 'checkout' ? 'Starting checkout…' : `Checkout · ${formatINR(cartTotal)}`}
              </button>
            )}

            {idleDeadline && <div style={{ marginTop: 10, textAlign: 'center' }}><IdleCountdown key={idleDeadline} deadline={idleDeadline} /></div>}
          </div>

          <div className="card">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <h3>One-tap UPI</h3>
              <span className="badge badge-success">Saved</span>
            </div>
            <p className="small secondary" style={{ marginBottom: 12 }}>
              Pay with your saved UPI {customer?.upi_id ? <strong className="accent">{customer.upi_id}</strong> : null}. Your security PIN is checked by our server — nothing is charged without it.
            </p>
            <PinForm busy={busy === 'pin'} label={`Pay ${formatINR(cartTotal)}`} onSubmit={handlePinPay} />
            {firstMethod && firstMethod !== 'UPI' && <p className="field-hint">Prefer {firstMethod}? Use Checkout above.</p>}
          </div>

          <div className="card card-tight">
            <div className="row-between">
              <div>
                <h3>Test a declined payment</h3>
                <p className="small muted">See how a failure is handled — no charge, logged in the audit trail.</p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={startFailureSimulation} disabled={!!busy}>
                {busy === 'simulate' ? '…' : 'Simulate'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {checkout && (
        <PaymentModal
          order={checkout.order}
          failing={checkout.failing}
          methods={methods?.methods}
          emi={emi}
          customer={customer}
          onClose={() => setCheckout(null)}
          onPaid={handlePaid}
          onFailed={() => showToast('error', 'Payment failed', "Payment couldn't be completed — no charge was made.")}
        />
      )}
    </div>
  );
}

export default Cart;
