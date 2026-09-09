import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../App';
import SuggestionPanel from '../components/SuggestionPanel';
import {
  getSuggestion, acceptSuggestion, dismissSuggestion,
  createOrder, verifyPayment, simulateFailure,
  triggerAbandonedCart, getAbandonConfig,
  getPaymentMethodSuggestion, getEmiSuggestion,
} from '../api';

function Cart() {
  const {
    cart, removeFromCart, updateCartQuantity, clearCart,
    cartTotal, selectedCustomer, addToCart, showToast,
  } = useApp();

  const [suggestion, setSuggestion] = useState(null);
  const [suggestionProduct, setSuggestionProduct] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentGate, setPaymentGate] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [mockModal, setMockModal] = useState(null);
  const [mockStep, setMockStep] = useState('card');

  // Growth feature states
  const [abandonBanner, setAbandonBanner] = useState(null);
  const [abandonTimer, setAbandonTimer] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [emiSuggestion, setEmiSuggestion] = useState(null);
  const [directPin, setDirectPin] = useState('1234');
  const [directPayLoading, setDirectPayLoading] = useState(false);
  const abandonTimerRef = useRef(null);
  const countdownRef = useRef(null);

  // ========== FETCH AI SUGGESTION ==========
  useEffect(() => {
    if (cart.length > 0 && selectedCustomer) {
      fetchSuggestion();
      fetchPaymentMethods();
      fetchEmiSuggestion();
      startAbandonTimer();
    } else {
      setSuggestion(null);
      setSuggestionProduct(null);
      clearAbandonTimer();
    }
    return () => clearAbandonTimer();
  }, [cart.length, selectedCustomer?.id]);

  // Refresh EMI when cart total changes
  useEffect(() => {
    if (cart.length > 0) fetchEmiSuggestion();
  }, [cartTotal]);

  async function fetchSuggestion() {
    if (!selectedCustomer || cart.length === 0) return;
    setSuggestionLoading(true);
    setSuggestion(null);
    setSuggestionProduct(null);
    setBlocked(null);
    try {
      const cartItems = cart.map(item => ({ id: item.id, quantity: item.quantity }));
      const data = await getSuggestion(selectedCustomer.id, cartItems);
      if (data.blocked) {
        setBlocked(data.reason);
      } else if (data.suggestion) {
        setSuggestion(data.suggestion);
        setSuggestionProduct(data.product);
        if (data.suggestion.notify && data.suggestion.discount_percent > 0) {
          showToast('discount', `🎉 ${data.suggestion.discount_percent}% off!`, `${data.suggestion.suggestion_name} has an active discount for you!`);
        }
      }
    } catch (err) { console.error('Suggestion error:', err); }
    finally { setSuggestionLoading(false); }
  }

  // ========== GROWTH FEATURE 1: Abandoned Cart ==========
  function clearAbandonTimer() {
    if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setAbandonTimer(0);
  }

  async function startAbandonTimer() {
    clearAbandonTimer();
    setAbandonBanner(null);
    try {
      const config = await getAbandonConfig();
      if (!config.enabled) return;
      const timeout = config.timeout || 60;
      setAbandonTimer(timeout);

      // Countdown display
      countdownRef.current = setInterval(() => {
        setAbandonTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Trigger abandon after timeout
      abandonTimerRef.current = setTimeout(async () => {
        try {
          const cartItems = cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }));
          const data = await triggerAbandonedCart(selectedCustomer?.id, cartItems, cartTotal);
          if (data.success) {
            setAbandonBanner(data);
            showToast('info', '⏰ Still thinking?', 'We saved your cart — here\'s a quick link to finish your order!');
          }
        } catch (err) { console.error('Abandon cart error:', err); }
      }, timeout * 1000);
    } catch (err) { console.error('Abandon config error:', err); }
  }

  // ========== GROWTH FEATURE 2: Payment Method Recommender ==========
  async function fetchPaymentMethods() {
    if (!selectedCustomer) return;
    try {
      const data = await getPaymentMethodSuggestion(selectedCustomer.id);
      setPaymentMethods(data);
    } catch (err) { console.error('Payment method error:', err); }
  }

  // ========== GROWTH FEATURE 3: EMI Suggestion ==========
  async function fetchEmiSuggestion() {
    if (cartTotal <= 0) return;
    try {
      const data = await getEmiSuggestion(cartTotal, selectedCustomer?.id);
      setEmiSuggestion(data);
    } catch (err) { console.error('EMI suggestion error:', err); }
  }

  // ========== SUGGESTION HANDLERS ==========
  async function handleAcceptSuggestion(sugg, product) {
    addToCart(product);
    showToast('success', 'Suggestion Accepted', `${product.name} added to your cart`);
    try { await acceptSuggestion(selectedCustomer?.id, sugg.suggestion_product_id, sugg.suggestion_name); } catch {}
    setSuggestion(null);
    setSuggestionProduct(null);
  }

  async function handleDismissSuggestion(sugg) {
    showToast('info', 'Suggestion Dismissed', "We'll try a different recommendation next time");
    try { await dismissSuggestion(selectedCustomer?.id, sugg.suggestion_product_id, sugg.suggestion_name); } catch {}
  }

  // ========== PAYMENT HANDLERS ==========
  async function handlePayment() {
    if (cart.length === 0) return;
    setPaymentLoading(true);
    clearAbandonTimer();
    try {
      const cartItems = cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }));
      const data = await createOrder(cartTotal, cartItems, selectedCustomer?.id);
      setPaymentGate(data.gate);
      if (!data.gate.autoApprove && !showConfirmation) {
        setShowConfirmation(true);
        setPaymentLoading(false);
        return;
      }
      if (data.mock) {
        setMockModal({ order: data.order, type: 'pay' });
        setMockStep('card');
        setPaymentLoading(false);
      } else { openRazorpayCheckout(data.order, data.key_id); }
    } catch (err) {
      showToast('error', 'Order Failed', err.message);
      setPaymentLoading(false);
    }
  }

  async function handleMockPaySuccess() {
    setMockStep('processing');
    await new Promise(r => setTimeout(r, 2000));
    try {
      await verifyPayment(mockModal.order.id, 'pay_mock_' + Date.now(), 'mock_valid_signature', cartTotal, selectedCustomer?.id);
      setMockModal(null);
      showToast('success', 'Payment Successful! 🎉', `₹${Math.round(cartTotal).toLocaleString()} paid successfully`);
      clearCart();
      setShowConfirmation(false);
    } catch (err) { showToast('error', 'Payment Error', err.message); }
  }

  async function handleMockPayFailure() {
    setMockStep('processing');
    await new Promise(r => setTimeout(r, 1500));
    try { await verifyPayment(mockModal.order.id, 'pay_fail_' + Date.now(), 'mock_invalid_signature', cartTotal, selectedCustomer?.id); } catch {}
    setMockModal(null);
    showToast('error', 'Payment Failed', "Payment couldn't be completed — no charge was made. Try again or use a different method.");
  }

  // ========== DIRECT MOBILE PAY WITH STORED PIN ==========
  async function handleDirectMobilePay(isDeclineTest = false) {
    if (!isDeclineTest && directPin !== '1234' && directPin !== 'password') {
      showToast('error', 'Security Verification Failed', 'Invalid security PIN / password. Transaction blocked.');
      return;
    }

    setDirectPayLoading(true);
    try {
      if (isDeclineTest) {
        await new Promise(r => setTimeout(r, 1200));
        showToast('error', 'Payment Failed', 'Bank declined transaction: Insufficient funds or invalid authorization. No money was deducted.');
        return;
      }

      await new Promise(r => setTimeout(r, 1200));
      const orderId = 'order_direct_' + Date.now();
      const paymentId = 'pay_direct_' + Date.now();

      await verifyPayment(orderId, paymentId, 'mock_valid_signature', cartTotal, selectedCustomer?.id);
      showToast('success', 'Money Deducted Successfully! 🎉', `₹${Math.round(cartTotal).toLocaleString()} charged to ${selectedCustomer?.phone || 'linked mobile'}`);
      clearCart();
      setShowConfirmation(false);
    } catch (err) {
      showToast('error', 'Payment Failed', err.message);
    } finally {
      setDirectPayLoading(false);
    }
  }

  function openRazorpayCheckout(order, keyId) {
    const options = {
      key: keyId, amount: order.amount, currency: order.currency,
      name: 'ShopMind AI', description: 'AI-Powered Commerce Demo', order_id: order.id,
      handler: async (response) => {
        try {
          await verifyPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature, cartTotal, selectedCustomer?.id);
          showToast('success', 'Payment Successful! 🎉', `₹${Math.round(cartTotal).toLocaleString()} paid`);
          clearCart(); setShowConfirmation(false);
        } catch (err) { showToast('error', 'Verification Failed', err.message); }
        setPaymentLoading(false);
      },
      modal: { ondismiss: () => { showToast('warning', 'Payment Cancelled', 'You closed the payment window'); setPaymentLoading(false); } },
      prefill: { name: selectedCustomer?.name || 'Test User', email: 'test@shopmind.ai', contact: '9999999999' },
      theme: { color: '#D9822B' },
    };
    if (window.Razorpay) {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => { showToast('error', 'Payment Failed', "Payment couldn't be completed — no charge was made."); setPaymentLoading(false); });
      rzp.open();
    } else {
      setMockModal({ order, type: 'pay' }); setMockStep('card'); setPaymentLoading(false);
    }
  }

  async function handleSimulateFailure() {
    setPaymentLoading(true);
    try {
      const data = await simulateFailure(cartTotal || 1000, selectedCustomer?.id);
      if (data.mock || !window.Razorpay) {
        setMockModal({ order: data.order, type: 'fail' }); setMockStep('card'); setPaymentLoading(false);
      } else { openRazorpayCheckout(data.order, data.key_id); }
    } catch (err) { showToast('error', 'Simulation Error', err.message); setPaymentLoading(false); }
  }

  // ========== MOCK PAYMENT MODAL ==========
  function MockPaymentModal() {
    if (!mockModal) return null;
    const isFailing = mockModal.type === 'fail';
    const amount = mockModal.order.amount / 100;
    const methodIcons = { UPI: '📱', Card: '💳', Netbanking: '🏦', Wallet: '👛', EMI: '📊' };
    const [modalMethod, setModalMethod] = useState(
      paymentMethods?.methods?.[0] || (selectedCustomer?.preferred_method || 'UPI')
    );
    const [upiInput, setUpiInput] = useState(selectedCustomer?.upi_id || 'customer@upi');
    const [selectedBank, setSelectedBank] = useState('State Bank of India');

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeIn 0.3s ease' }}>
        <div style={{ background: '#1A1714', borderRadius: '16px', width: '480px', maxWidth: '92vw', overflow: 'hidden', border: '1px solid var(--border-primary)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          {/* Header */}
          <div style={{ background: isFailing ? 'linear-gradient(135deg, #E74C3C, #C0392B)' : 'linear-gradient(135deg, #D9822B, #E8973F)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>{isFailing ? '🧪 Failure Simulation' : '💳 ShopMind Razorpay Payment'}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>
                {isFailing ? 'Simulated decline test' : `Phone: ${selectedCustomer?.phone || '+91 98765 34562'} • Secure Checkout`}
              </div>
            </div>
            <button onClick={() => { setMockModal(null); showToast('warning', 'Payment Cancelled', 'Payment window closed'); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>

          {/* Amount & Security Sync Banner */}
          <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-primary)' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Payable Amount</span>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-primary)' }}>₹{Math.round(amount).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>
              <div>📱 Linked Mobile</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{selectedCustomer?.phone || '+91 98765 34562'}</div>
            </div>
          </div>

          {/* Method Selection Tabs */}
          {!isFailing && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
              {['UPI', 'Card', 'Netbanking', 'EMI'].map((m) => (
                <button
                  key={m}
                  onClick={() => setModalMethod(m)}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    border: 'none',
                    background: modalMethod === m ? 'var(--bg-card)' : 'transparent',
                    borderBottom: modalMethod === m ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    color: modalMethod === m ? 'var(--accent-primary)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: modalMethod === m ? '700' : '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{methodIcons[m] || '💳'}</span>
                  <span>{m}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab Contents */}
          <div style={{ padding: '20px 22px' }}>
            {mockStep === 'card' && !isFailing && modalMethod === 'UPI' && (
              <div className="animate-fade-in">
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📱</span> <strong>UPI Instant Payment</strong> (GPay, PhonePe, Paytm, BHIM)
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Enter UPI ID / VPA</label>
                  <input
                    className="input-field"
                    value={upiInput}
                    onChange={(e) => setUpiInput(e.target.value)}
                    placeholder="mobile@upi or user@okaxis"
                    style={{ fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                  {['@okaxis', '@okhdfcbank', '@paytm', '@ybl'].map((handle) => (
                    <button
                      key={handle}
                      onClick={() => setUpiInput((selectedCustomer?.name.toLowerCase() || 'user') + handle)}
                      style={{
                        flex: 1, padding: '4px 6px', fontSize: '11px', background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                      }}
                    >
                      {handle}
                    </button>
                  ))}
                </div>

                {/* Security Mobile Approval Note */}
                <div style={{ padding: '8px 12px', background: 'var(--info-bg)', border: '1px solid rgba(52, 152, 219, 0.2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  🔒 <strong>Security Verification:</strong> UPI collect request will be sent to your linked device ({selectedCustomer?.phone || '+91 98765 34562'}).
                </div>

                <button className="btn-primary" onClick={handleMockPaySuccess} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  ⚡ Pay ₹{Math.round(amount).toLocaleString()} via UPI
                </button>
              </div>
            )}

            {mockStep === 'card' && !isFailing && modalMethod === 'Card' && (
              <div className="animate-fade-in">
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Card Number</label>
                  <input className="input-field" value="4111 1111 1111 1111" readOnly style={{ fontFamily: 'monospace', letterSpacing: '2px', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div><label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Expiry</label><input className="input-field" value="12/28" readOnly style={{ fontSize: '13px' }} /></div>
                  <div><label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>CVV</label><input className="input-field" value="123" readOnly style={{ fontSize: '13px' }} /></div>
                </div>
                <button className="btn-primary" onClick={handleMockPaySuccess} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  💳 Pay ₹{Math.round(amount).toLocaleString()} via Card
                </button>
              </div>
            )}

            {mockStep === 'card' && !isFailing && modalMethod === 'Netbanking' && (
              <div className="animate-fade-in">
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Select Bank</label>
                <select className="input-field" value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} style={{ marginBottom: '14px', fontSize: '13px' }}>
                  <option>State Bank of India (SBI)</option>
                  <option>HDFC Bank</option>
                  <option>ICICI Bank</option>
                  <option>Axis Bank</option>
                  <option>Kotak Mahindra Bank</option>
                </select>
                <button className="btn-primary" onClick={handleMockPaySuccess} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  🏦 Proceed with {selectedBank.split(' ')[0]}
                </button>
              </div>
            )}

            {mockStep === 'card' && !isFailing && modalMethod === 'EMI' && (
              <div className="animate-fade-in">
                <div style={{ padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--accent-border)', borderRadius: '8px', marginBottom: '14px' }}>
                  <div style={{ fontWeight: '700', color: 'var(--accent-primary)', fontSize: '14px', marginBottom: '4px' }}>
                    📊 3-Month No-Cost EMI
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    ₹{Math.round(amount / 3).toLocaleString()} / month for 3 months
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Interest: ₹0 • Total: ₹{Math.round(amount).toLocaleString()}
                  </div>
                </div>
                <button className="btn-primary" onClick={handleMockPaySuccess} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  📊 Confirm 3-Month EMI of ₹{Math.round(amount / 3).toLocaleString()}/mo
                </button>
              </div>
            )}

            {/* Failure Mode Card */}
            {mockStep === 'card' && isFailing && (
              <div className="animate-fade-in">
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Test Failure Card</label>
                  <input className="input-field" value="4000 0000 0000 0002" readOnly style={{ fontFamily: 'monospace', letterSpacing: '2px' }} />
                </div>
                <div style={{ background: 'var(--error-bg)', border: '1px solid rgba(231, 76, 60, 0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '12px', color: 'var(--error)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚠️ This card will be declined to test graceful failure handling
                </div>
                <button className="btn-danger" onClick={handleMockPayFailure} style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                  🧪 Process (Will Fail)
                </button>
              </div>
            )}

            {/* Processing Spinner */}
            {mockStep === 'processing' && (
              <div className="animate-fade-in" style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ width: '44px', height: '44px', border: '3px solid var(--border-primary)', borderTopColor: isFailing ? 'var(--error)' : 'var(--accent-primary)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: '15px', fontWeight: '600' }}>{isFailing ? 'Processing decline test...' : 'Communicating with payment gateway...'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Verifying signatures & device credentials...</div>
              </div>
            )}
          </div>

          <div style={{ padding: '10px 22px', borderTop: '1px solid var(--border-primary)', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            🔒 Secured with Razorpay Test Mode • Cryptographic Signature Verification
          </div>
        </div>
      </div>
    );
  }

  // ========== EMPTY CART ==========
  if (cart.length === 0) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="animate-fade-in">
          <span style={{ fontSize: '64px', display: 'block', marginBottom: '20px' }}>🛒</span>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Your cart is empty</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Browse our catalog and add items to get AI-powered suggestions</p>
          <Link to="/" className="btn-primary" style={{ display: 'inline-flex' }}>🏪 Browse Catalog</Link>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ========== MAIN CART VIEW ==========
  return (
    <div className="page-container animate-fade-in">
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px', letterSpacing: '-0.5px' }}>🛒 Shopping Cart</h1>

      {/* Feature 1: Abandoned Cart Recovery Banner */}
      {abandonBanner && (
        <div className="animate-slide-up" style={{ marginBottom: '20px', padding: '16px 20px', background: 'linear-gradient(135deg, rgba(52, 152, 219, 0.15), rgba(217, 130, 43, 0.1))', border: '1px solid rgba(52, 152, 219, 0.3)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '32px' }}>⏰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>Still thinking? Here's a quick link to finish your order 👉</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              We saved your cart of ₹{Math.round(cartTotal).toLocaleString()} — complete the purchase anytime!
            </div>
          </div>
          <a href={abandonBanner.recoveryLink} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
            💳 Pay Now
          </a>
        </div>
      )}

      {/* Abandon timer countdown */}
      {abandonTimer > 0 && !abandonBanner && (
        <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>⏱️</span> Recovery link generates in {abandonTimer}s if no checkout action
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', alignItems: 'start' }}>
        {/* Cart Items */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cart.map(item => {
              const dp = item.discount_active ? item.price * (1 - item.discount_percent / 100) : item.price;
              return (
                <div key={item.id} className="glass-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>{item.image}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>{item.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>₹{Math.round(dp).toLocaleString()}</span>
                      {item.discount_active && <span style={{ fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>₹{item.price.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button className="btn-secondary" onClick={() => updateCartQuantity(item.id, item.quantity - 1)} style={{ padding: '4px 10px', fontSize: '14px' }}>−</button>
                    <span style={{ width: '30px', textAlign: 'center', fontWeight: '600' }}>{item.quantity}</span>
                    <button className="btn-secondary" onClick={() => updateCartQuantity(item.id, item.quantity + 1)} style={{ padding: '4px 10px', fontSize: '14px' }}>+</button>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '16px', minWidth: '80px', textAlign: 'right' }}>₹{Math.round(dp * item.quantity).toLocaleString()}</span>
                  <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}>🗑️</button>
                </div>
              );
            })}
          </div>

          {/* Blocked Guardrail */}
          {blocked && (
            <div className="glass-card animate-slide-up" style={{ padding: '16px', marginTop: '20px', borderColor: 'rgba(243, 156, 18, 0.3)', background: 'var(--warning-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🚫</span>
                <div>
                  <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--warning)' }}>Suggestion Blocked by Guardrail</span>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{blocked}</p>
                </div>
              </div>
            </div>
          )}

          {/* AI Suggestion */}
          <SuggestionPanel suggestion={suggestion} product={suggestionProduct} loading={suggestionLoading} onAccept={handleAcceptSuggestion} onDismiss={handleDismissSuggestion} />
        </div>

        {/* ===== ORDER SUMMARY ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '88px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Order Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Items ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                <span>₹{Math.round(cart.reduce((s, i) => s + i.price * i.quantity, 0)).toLocaleString()}</span>
              </div>
              {cart.some(i => i.discount_active) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--success)' }}>
                  <span>Discounts</span>
                  <span>-₹{Math.round(cart.reduce((s, i) => i.discount_active ? s + (i.price * i.discount_percent / 100) * i.quantity : s, 0)).toLocaleString()}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700' }}>
                <span>Total</span>
                <span style={{ color: 'var(--accent-primary)' }}>₹{Math.round(cartTotal).toLocaleString()}</span>
              </div>
            </div>

            {/* Feature 3: EMI Suggestion Card */}
            {emiSuggestion && emiSuggestion.eligible && (
              <div className="animate-slide-up" style={{ padding: '12px 16px', background: 'linear-gradient(135deg, rgba(217, 130, 43, 0.1), rgba(46, 204, 113, 0.05))', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span>💳</span>
                  <span style={{ fontWeight: '600', color: 'var(--accent-primary)', fontSize: '14px' }}>EMI Available</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Split into <strong>{emiSuggestion.months} easy payments</strong> of <strong style={{ color: 'var(--accent-primary)' }}>₹{emiSuggestion.emiAmount?.toLocaleString()}</strong>
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  💡 {emiSuggestion.reason}
                </p>
              </div>
            )}

            {/* Payment Gate Warning */}
            {showConfirmation && paymentGate && !paymentGate.autoApprove && (
              <div style={{ padding: '12px 16px', background: 'var(--warning-bg)', border: '1px solid rgba(243, 156, 18, 0.3)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span>⚠️</span>
                  <span style={{ fontWeight: '600', color: 'var(--warning)', fontSize: '13px' }}>Payment Gate — Manual Confirmation Required</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Amount ₹{Math.round(cartTotal).toLocaleString()} exceeds auto-approve threshold of ₹{paymentGate.threshold.toLocaleString()}. Click "Confirm & Pay" to proceed.
                </p>
              </div>
            )}

            {/* Feature 2: Payment Method Info */}
            {paymentMethods && paymentMethods.reordered && (
              <div style={{ fontSize: '12px', color: 'var(--info)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'var(--info-bg)', borderRadius: 'var(--radius-sm)' }}>
                <span>✨</span> {paymentMethods.explainability}
              </div>
            )}

            {/* FEATURE: Instant 1-Click Direct Pay via Mobile Sync & Pre-Stored PIN */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(217, 130, 43, 0.15), rgba(46, 204, 113, 0.1))',
              border: '1px solid var(--accent-border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                    Direct Pay (Mobile Synced)
                  </span>
                </div>
                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                  ● Stored & Synced
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>📱 <strong>Connected Mobile:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{selectedCustomer?.phone || '+91 98765 34562'}</span></div>
                <div>⚡ <strong>Linked UPI:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{selectedCustomer?.upi_id || 'customer@upi'}</span></div>
              </div>

              <div style={{ background: 'var(--bg-primary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Authorized Security PIN / Password (Pre-Stored: 1234)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    className="input-field"
                    maxLength="8"
                    value={directPin}
                    onChange={(e) => setDirectPin(e.target.value)}
                    placeholder="PIN"
                    style={{ width: '80px', textAlign: 'center', letterSpacing: '4px', fontSize: '14px', padding: '6px' }}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => handleDirectMobilePay(false)}
                    disabled={directPayLoading || cart.length === 0}
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: 'linear-gradient(135deg, #2ECC71, #27AE60)',
                      border: 'none',
                    }}
                  >
                    {directPayLoading ? '⏳ Deducting Money...' : `⚡ 1-Click Pay ₹${Math.round(cartTotal).toLocaleString()}`}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                <a
                  href={`https://rzp.io/l/quick_${selectedCustomer?.id || 'cust'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
                >
                  🔗 Direct Link Sent to Phone
                </a>
                <button
                  onClick={() => handleDirectMobilePay(true)}
                  disabled={directPayLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#E74C3C',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  🧪 Test Decline Condition
                </button>
              </div>
            </div>

            <button className="btn-primary" onClick={handlePayment} disabled={paymentLoading} style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px' }}>
              {paymentLoading ? '⏳ Processing...' : showConfirmation ? '✓ Confirm & Pay' : '💳 Pay with Razorpay'}
            </button>
            <button className="btn-danger" onClick={handleSimulateFailure} disabled={paymentLoading} style={{ width: '100%', justifyContent: 'center', marginTop: '10px', fontSize: '13px', padding: '10px' }}>
              🧪 Simulate Payment Failure
            </button>
            <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>🔒 Test mode — no real charges</p>
          </div>
        </div>
      </div>

      <MockPaymentModal />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default Cart;
