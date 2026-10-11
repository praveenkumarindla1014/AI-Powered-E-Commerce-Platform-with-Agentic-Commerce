const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const store = require('../services/store');
const { checkAbandonedCartRecovery, getPaymentMethodOrder, checkEmiEligibility } = require('../services/guardrails');
const { priceCart } = require('../services/pricing');
const { verifyPin } = require('../services/profile');
const { customerEmis, payInstallment } = require('../services/emi');
const { logAudit } = require('../services/auditLogger');

const RECOVERY_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;
const formatINR = n => `₹${Math.round(n).toLocaleString('en-IN')}`;

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Pending links past their expiry are reported as expired. */
function withExpiry(cart) {
  if (cart.status === 'pending' && new Date(cart.expiresAt).getTime() < Date.now()) {
    return { ...cart, status: 'expired' };
  }
  return cart;
}

// =============================================
// FEATURE 1: Abandoned Cart Recovery
// =============================================

// GET /api/cart/abandon-config — Is recovery enabled, and after how many idle seconds?
router.get('/cart/abandon-config', (req, res) => {
  res.json({ success: true, ...checkAbandonedCartRecovery() });
});

// POST /api/cart/abandon — Save an idle cart and create a recovery link
router.post('/cart/abandon', (req, res) => {
  const { customerId, cartItems } = req.body;
  const config = checkAbandonedCartRecovery();
  if (!config.enabled) return res.json({ success: false, reason: 'Abandoned cart recovery is disabled' });

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ success: false, error: 'Cart is empty' });
  }

  const customer = store.read('customers').find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  const pricing = priceCart(cartItems, store.read('products'));
  if (pricing.lines.length === 0) return res.status(409).json({ success: false, error: 'Cart items are unavailable' });

  // Guardrail: at most one recovery link per customer every 5 minutes
  const carts = store.read('abandoned_carts');
  const recent = carts.find(c => c.customerId === customerId && c.status === 'pending' &&
    Date.now() - new Date(c.timestamp).getTime() < RECOVERY_COOLDOWN_MS);
  if (recent) {
    return res.json({ success: true, alreadyExists: true, linkId: recent.id, recoveryLink: recent.recoveryLink, cartTotal: recent.cartTotal });
  }

  const linkId = 'rcv_' + crypto.randomBytes(6).toString('hex');
  const record = {
    id: linkId,
    customerId,
    customerName: customer.name,
    cartItems: pricing.lines.map(l => ({ id: l.id, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
    cartTotal: pricing.total,
    recoveryLink: `${frontendUrl()}/recover/${linkId}`,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RECOVERY_LINK_TTL_MS).toISOString(),
    status: 'pending', // pending | recovered | closed | expired
  };

  carts.unshift(record);
  store.write('abandoned_carts', carts);

  logAudit('cart_recovery', {
    status: 'success',
    customer: customer.name,
    amount: pricing.total,
    reasoning: `Cart idle for ${config.timeout}s (${pricing.lines.length} item${pricing.lines.length === 1 ? '' : 's'}, ${formatINR(pricing.total)}). Recovery link created, valid for 24 hours.`,
    details: { linkId, recoveryLink: record.recoveryLink },
  });

  res.json({ success: true, linkId, recoveryLink: record.recoveryLink, cartTotal: pricing.total });
});

// GET /api/cart/recover/:linkId — Open a recovery link (restores the saved cart)
router.get('/cart/recover/:linkId', (req, res) => {
  const cart = store.read('abandoned_carts').find(c => c.id === req.params.linkId);
  if (!cart) return res.status(404).json({ success: false, error: 'This recovery link does not exist' });

  const current = withExpiry(cart);
  if (current.status !== 'pending') {
    const messages = {
      expired: 'This recovery link has expired',
      recovered: 'This cart has already been paid for',
      closed: 'This cart was already checked out',
    };
    return res.status(410).json({ success: false, error: messages[current.status] || 'Link is no longer valid', status: current.status });
  }

  logAudit('cart_recovery_opened', {
    status: 'info',
    customer: cart.customerName,
    amount: cart.cartTotal,
    reasoning: `Recovery link ${cart.id} opened — saved cart restored`,
  });

  res.json({ success: true, cart: current });
});

// GET /api/cart/recovered — All recovery links (admin)
router.get('/cart/recovered', (req, res) => {
  const carts = store.read('abandoned_carts').map(withExpiry);
  res.json({ success: true, carts, total: carts.length });
});

// =============================================
// FEATURE 2: Smart Payment Method Recommender
// =============================================

// POST /api/payment-method-suggest — Payment methods ordered for this customer
router.post('/payment-method-suggest', (req, res) => {
  const customer = store.read('customers').find(c => c.id === req.body.customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  const result = getPaymentMethodOrder(customer);

  if (result.reordered && req.body.log !== false) {
    logAudit('payment_method_reorder', {
      status: 'info',
      customer: customer.name,
      reasoning: `Checkout methods ordered ${result.methods.join(' → ')}. ${result.reason}`,
      details: { methods: result.methods, age: customer.age, preferred: customer.preferred_method || null },
    });
  }

  res.json({
    success: true,
    methods: result.methods,
    reason: result.reason,
    reordered: result.reordered,
    explainability: result.reordered ? `${result.methods[0]} is shown first — ${result.reason.split('— ')[1] || 'it is usually fastest for you'}` : null,
  });
});

// =============================================
// FEATURE 3: EMI/BNPL Suggestion
// =============================================

// POST /api/emi-suggest — EMI eligibility for a cart total
router.post('/emi-suggest', (req, res) => {
  const cartTotal = Number(req.body.cartTotal);
  if (!Number.isFinite(cartTotal) || cartTotal <= 0) {
    return res.status(400).json({ success: false, error: 'A positive cartTotal is required' });
  }

  const result = checkEmiEligibility(cartTotal);
  if (result.eligible) {
    logAudit('emi_suggestion', {
      status: 'info',
      customer: req.body.customerId,
      amount: cartTotal,
      reasoning: `${result.message}. ${result.reason}`,
      details: { emiAmount: result.emiAmount, months: result.months, threshold: result.threshold },
    });
  }

  res.json({ success: true, ...result });
});

// =============================================
// FEATURE 4: Pending EMI installments
// =============================================

// GET /api/emi/pending/:customerId — EMI plans with due/overdue status
router.get('/emi/pending/:customerId', (req, res) => {
  const emis = customerEmis(req.params.customerId);
  res.json({ success: true, emis, totalPending: emis.filter(e => e.nextDue).length });
});

// POST /api/emi/pay-installment — Pay the next installment, approved with the security PIN
router.post('/emi/pay-installment', (req, res) => {
  const { customerId, emiId, installmentNumber, securityPin } = req.body;

  const customer = store.read('customers').find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  const pinCheck = verifyPin(customer, securityPin);
  if (!pinCheck.ok) {
    logAudit('emi_pin_failed', {
      status: 'blocked',
      customer: customer.name,
      reasoning: `Wrong security PIN for EMI ${emiId} installment #${installmentNumber} — payment blocked`,
      details: { emiId, installmentNumber },
    });
    return res.status(401).json({ success: false, error: pinCheck.reason });
  }

  const result = payInstallment(customerId, emiId, installmentNumber);
  if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });

  logAudit('emi_installment_paid', {
    status: 'success',
    customer: customer.name,
    amount: result.installment.amount,
    reasoning: `EMI installment #${installmentNumber} (${formatINR(result.installment.amount)}) for "${result.record.productName}" paid via UPI mandate, approved with security PIN`,
    details: { emiId, installmentNumber, remaining: result.record.outstanding },
  });

  res.json({
    success: true,
    message: `Installment #${installmentNumber} paid`,
    installment: result.installment,
    plan: result.record,
  });
});

module.exports = router;
