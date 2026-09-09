const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, isMockMode } = require('../services/razorpayService');
const { checkPaymentGate } = require('../services/guardrails');
const { logAudit } = require('../services/auditLogger');

// POST /api/payments/create-order — Create order (real or mock)
router.post('/create-order', async (req, res) => {
  try {
    const { amount, cartItems, customerId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    // Check payment gate
    const gate = checkPaymentGate(amount);

    // Create order (mock or real)
    const order = await createOrder(amount, `receipt_${Date.now()}`);

    logAudit('order_created', {
      status: 'success',
      customer: customerId,
      amount,
      reasoning: `Order ₹${amount} created. ${gate.autoApprove ? 'Auto-approved (under ₹' + gate.threshold + ' threshold)' : 'Manual confirmation required (above ₹' + gate.threshold + ' threshold)'}. Mode: ${isMockMode() ? 'MOCK' : 'LIVE'}`,
      details: {
        orderId: order.id,
        cartItems,
        gate,
        mock: isMockMode()
      }
    });

    res.json({
      success: true,
      order,
      key_id: process.env.RAZORPAY_KEY_ID || 'mock_key',
      gate,
      mock: isMockMode()
    });
  } catch (error) {
    console.error('Order creation error:', error);
    logAudit('order_failed', {
      status: 'failed',
      amount: req.body.amount,
      reasoning: `Order creation failed: ${error.message}`,
      customer: req.body.customerId
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/payments/verify-payment — Verify payment signature
router.post('/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, customerId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
    }

    const result = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (result.valid) {
      logAudit('payment_success', {
        status: 'success',
        customer: customerId,
        amount,
        reasoning: `Payment ₹${amount} verified successfully. Order: ${razorpay_order_id}. ${isMockMode() ? '(Mock mode — no real charge)' : ''}`,
        details: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          mock: isMockMode()
        }
      });

      res.json({ success: true, message: 'Payment verified successfully!' });
    } else {
      logAudit('payment_failed', {
        status: 'failed',
        customer: customerId,
        amount,
        reasoning: `Payment verification failed: ${result.reason}`,
        details: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          reason: result.reason
        }
      });

      res.status(400).json({ success: false, error: result.reason });
    }
  } catch (error) {
    logAudit('payment_error', {
      status: 'failed',
      reasoning: `Payment verification error: ${error.message}`
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/payments/simulate-failure — Deliberate failure for demo
router.post('/simulate-failure', async (req, res) => {
  try {
    const { amount, customerId } = req.body;
    const failAmount = amount || 1000;

    // Create a real order first
    const order = await createOrder(failAmount, `fail_receipt_${Date.now()}`);

    logAudit('payment_failure_simulated', {
      status: 'failed',
      customer: customerId,
      amount: failAmount,
      reasoning: `Deliberate payment failure simulation. Order ₹${failAmount} created but payment intentionally declined. No charge was made. This demonstrates graceful error handling.`,
      details: {
        orderId: order.id,
        simulation: true,
        failureReason: 'Payment declined — card authentication failed (simulated)'
      }
    });

    res.json({
      success: true,
      order,
      simulateFailure: true,
      mock: isMockMode(),
      message: 'Failure simulation triggered — payment declined gracefully'
    });
  } catch (error) {
    logAudit('simulation_error', {
      status: 'failed',
      reasoning: `Failure simulation error: ${error.message}`
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
