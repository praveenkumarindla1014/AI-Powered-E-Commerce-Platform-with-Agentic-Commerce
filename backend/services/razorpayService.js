const crypto = require('crypto');

let razorpayInstance = null;

function isMockMode() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  return !keyId || keyId === 'your_test_key_id_here' || !process.env.RAZORPAY_KEY_SECRET;
}

function getInstance() {
  if (isMockMode()) return null;

  if (!razorpayInstance) {
    const Razorpay = require('razorpay');
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay order, or a local mock order when no keys are configured.
 * @param {number} amount - Amount in ₹
 * @param {string} receipt - Receipt ID
 * @param {boolean} forceMock - always create a mock order (failure simulation, PIN pay)
 */
async function createOrder(amount, receipt, forceMock = false) {
  if (forceMock || isMockMode()) {
    return {
      id: 'order_mock_' + crypto.randomBytes(8).toString('hex'),
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000),
      mock: true,
    };
  }

  const order = await getInstance().orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt,
    notes: { source: 'ShopMind AI' },
  });
  return { ...order, mock: false };
}

/**
 * Verify a payment signature.
 * Mock signatures are accepted ONLY for mock orders — a live order always
 * requires a genuine Razorpay HMAC signature.
 */
function verifyPayment({ orderId, paymentId, signature, mock }) {
  if (mock) {
    if (signature === 'mock_valid_signature') {
      return { valid: true, reason: 'Payment verified (test mode)' };
    }
    return { valid: false, reason: 'Payment was declined by the bank (test mode)' };
  }

  if (!signature) return { valid: false, reason: 'Missing payment signature' };

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const valid = expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  return valid
    ? { valid: true, reason: 'Signature verified successfully' }
    : { valid: false, reason: 'Payment signature mismatch — possible tampering detected' };
}

module.exports = { createOrder, verifyPayment, getInstance, isMockMode };
