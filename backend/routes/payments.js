const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const store = require('../services/store');
const razorpay = require('../services/razorpayService');
const orders = require('../services/orders');
const { checkPaymentGate } = require('../services/guardrails');
const { priceCart } = require('../services/pricing');
const { verifyPin } = require('../services/profile');
const { logAudit } = require('../services/auditLogger');

const formatINR = n => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Shared validation: resolve customer and price the cart on the server. */
function prepareCheckout(req, res) {
  const { customerId, cartItems } = req.body;
  if (!customerId || !Array.isArray(cartItems) || cartItems.length === 0) {
    res.status(400).json({ success: false, error: 'customerId and a non-empty cartItems list are required' });
    return null;
  }

  const customer = store.read('customers').find(c => c.id === customerId);
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return null;
  }

  const pricing = priceCart(cartItems, store.read('products'));
  if (pricing.errors.length > 0) {
    res.status(409).json({ success: false, error: pricing.errors.join('. '), errors: pricing.errors });
    return null;
  }

  return { customer, pricing };
}

function publicKey() {
  return razorpay.isMockMode() ? null : process.env.RAZORPAY_KEY_ID;
}

// POST /api/payments/create-order — Start checkout (Razorpay order, or mock in test mode)
router.post('/create-order', async (req, res) => {
  const ctx = prepareCheckout(req, res);
  if (!ctx) return;
  const { customer, pricing } = ctx;
  const { confirmed = false, recoveryLinkId = null } = req.body;

  // Payment gate: large amounts need an explicit confirmation step
  const gate = checkPaymentGate(pricing.total);
  if (!gate.autoApprove && !confirmed) {
    logAudit('payment_gated', {
      status: 'blocked',
      customer: customer.name,
      amount: pricing.total,
      reasoning: `${formatINR(pricing.total)} is above the ${formatINR(gate.threshold)} auto-approve limit — waiting for the shopper to confirm`,
    });
    return res.json({ success: true, requiresConfirmation: true, gate, total: pricing.total });
  }

  try {
    const gatewayOrder = await razorpay.createOrder(pricing.total, `rcpt_${Date.now()}`);
    const order = orders.createOrderRecord({ gatewayOrder, customer, pricing, channel: 'checkout', recoveryLinkId });

    logAudit('order_created', {
      status: 'success',
      customer: customer.name,
      amount: pricing.total,
      reasoning: `Order ${order.id} created for ${formatINR(pricing.total)}. ${gate.autoApprove ? `Auto-approved (≤ ${formatINR(gate.threshold)})` : 'Confirmed by shopper at the payment gate'}. Mode: ${gatewayOrder.mock ? 'TEST (mock)' : 'Razorpay test'}`,
      details: { orderId: order.id, items: pricing.lines.map(l => ({ id: l.id, quantity: l.quantity })), gate },
    });

    res.json({
      success: true,
      order: { id: order.id, amount: gatewayOrder.amount, currency: 'INR', total: order.total },
      mock: order.mock,
      key_id: publicKey(),
      gate,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    logAudit('order_failed', {
      status: 'failed',
      customer: customer.name,
      amount: pricing.total,
      reasoning: `Order creation failed: ${error.error?.description || error.message}`,
    });
    res.status(502).json({ success: false, error: 'Could not reach the payment gateway. Please try again.' });
  }
});

// POST /api/payments/verify-payment — Confirm a payment for an existing order
router.post('/verify-payment', (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, method } = req.body;

  if (!orderId || !paymentId) {
    return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
  }

  const order = orders.getOrder(orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  // Idempotent: a retried callback must not charge or decrement stock twice
  if (order.status === 'paid') return res.json({ success: true, order, message: 'Order already paid' });

  const result = razorpay.verifyPayment({ orderId, paymentId, signature, mock: order.mock });

  if (!result.valid) {
    orders.markFailed(order, result.reason);
    logAudit('payment_failed', {
      status: 'failed',
      customer: order.customerName,
      amount: order.total,
      reasoning: `Payment for ${order.id} failed: ${result.reason}. No money was charged.`,
      details: { orderId, paymentId, simulation: order.simulation },
    });
    return res.status(402).json({ success: false, error: "Payment couldn't be completed — no charge was made.", reason: result.reason, order });
  }

  const paid = orders.markPaid(order, { paymentId, method });
  logAudit('payment_success', {
    status: 'success',
    customer: order.customerName,
    amount: order.total,
    reasoning: `Payment ${paymentId} for order ${order.id} verified (${result.reason})${method ? ` via ${method}` : ''}`,
    details: { orderId, paymentId, mock: order.mock },
  });

  res.json({ success: true, order: paid, message: 'Payment successful' });
});

// POST /api/payments/report-failure — Gateway reported a failure (e.g. Razorpay payment.failed)
router.post('/report-failure', (req, res) => {
  const { orderId, reason } = req.body;
  const order = orders.getOrder(orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (order.status === 'paid') return res.json({ success: true, order });

  const failureReason = String(reason || 'Payment failed at the gateway').slice(0, 200);
  orders.markFailed(order, failureReason);
  logAudit('payment_failed', {
    status: 'failed',
    customer: order.customerName,
    amount: order.total,
    reasoning: `Payment for ${order.id} failed: ${failureReason}. No money was charged.`,
    details: { orderId },
  });
  res.json({ success: true, order });
});

// POST /api/payments/pin-pay — One-tap pay with the saved UPI mandate, approved by security PIN
router.post('/pin-pay', async (req, res) => {
  const ctx = prepareCheckout(req, res);
  if (!ctx) return;
  const { customer, pricing } = ctx;
  const channel = req.body.channel === 'assistant' ? 'assistant' : 'pin';

  const pinCheck = verifyPin(customer, req.body.pin);
  if (!pinCheck.ok) {
    logAudit('pin_rejected', {
      status: 'blocked',
      customer: customer.name,
      amount: pricing.total,
      reasoning: `Wrong security PIN for a ${formatINR(pricing.total)} ${channel === 'assistant' ? 'assistant' : 'one-tap'} payment — transaction blocked`,
    });
    return res.status(401).json({ success: false, error: pinCheck.reason });
  }

  // Saved-mandate payments are simulated: there is no hosted checkout step
  const gatewayOrder = await razorpay.createOrder(pricing.total, `rcpt_${Date.now()}`, true);
  const order = orders.createOrderRecord({ gatewayOrder, customer, pricing, channel, recoveryLinkId: req.body.recoveryLinkId || null });
  const paymentId = 'pay_mock_' + crypto.randomBytes(6).toString('hex');
  const paid = orders.markPaid(order, { paymentId, method: `UPI · ${customer.upi_id}` });

  logAudit('payment_success', {
    status: 'success',
    customer: customer.name,
    amount: pricing.total,
    reasoning: `${channel === 'assistant' ? 'Assistant' : 'One-tap'} payment of ${formatINR(pricing.total)} approved with security PIN and charged to ${customer.upi_id} (test mode)`,
    details: { orderId: order.id, paymentId, channel },
  });

  res.json({ success: true, order: paid, message: 'Payment successful' });
});

// POST /api/payments/simulate-failure — Create a test order that the bank will decline
router.post('/simulate-failure', async (req, res) => {
  const ctx = prepareCheckout(req, res);
  if (!ctx) return;
  const { customer, pricing } = ctx;

  const gatewayOrder = await razorpay.createOrder(pricing.total, `fail_${Date.now()}`, true);
  const order = orders.createOrderRecord({ gatewayOrder, customer, pricing, channel: 'simulation', simulation: true });

  logAudit('payment_failure_simulated', {
    status: 'info',
    customer: customer.name,
    amount: pricing.total,
    reasoning: `Failure simulation started for ${formatINR(pricing.total)} — the test card will be declined`,
    details: { orderId: order.id },
  });

  res.json({
    success: true,
    order: { id: order.id, amount: gatewayOrder.amount, currency: 'INR', total: order.total },
    mock: true,
    simulateFailure: true,
  });
});

module.exports = router;
