const crypto = require('crypto');

let razorpayInstance = null;
const MOCK_MODE = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'your_test_key_id_here';

function getInstance() {
  if (MOCK_MODE) return null;

  if (!razorpayInstance) {
    const Razorpay = require('razorpay');
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay order (or mock order)
 * @param {number} amount - Amount in ₹
 * @param {string} receipt - Receipt ID
 * @returns {object} Order object
 */
async function createOrder(amount, receipt = 'order_receipt_1') {
  if (MOCK_MODE) {
    // Generate a realistic-looking mock order
    const orderId = 'order_mock_' + crypto.randomBytes(8).toString('hex');
    return {
      id: orderId,
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt,
      status: 'created',
      created_at: Date.now(),
      mock: true,
    };
  }

  const instance = getInstance();
  const options = {
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt,
    notes: {
      source: 'ShopMind AI',
      type: 'test_order'
    }
  };

  return await instance.orders.create(options);
}

/**
 * Verify payment signature (or mock verification)
 * @param {string} orderId
 * @param {string} paymentId
 * @param {string} signature
 * @returns {{ valid: boolean, reason: string }}
 */
function verifyPayment(orderId, paymentId, signature) {
  // Check if this is a direct mobile pay, simulated order, or mock payment
  const isDirectOrMock =
    MOCK_MODE ||
    orderId.startsWith('order_mock_') ||
    orderId.startsWith('order_direct_') ||
    orderId.startsWith('order_agent_') ||
    signature === 'mock_valid_signature' ||
    signature === 'mock_invalid_signature';

  if (isDirectOrMock) {
    if (signature === 'mock_valid_signature') {
      return { valid: true, reason: 'Payment verified successfully (Direct/Mock mode)' };
    } else if (signature === 'mock_invalid_signature') {
      return { valid: false, reason: 'Payment signature mismatch — possible tampering detected (simulated failure)' };
    }
    // Default verification for direct/mock
    return { valid: true, reason: 'Payment verified successfully (Direct/Mock mode)' };
  }

  // Real Razorpay verification
  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature === signature) {
      return { valid: true, reason: 'Signature verified successfully' };
    } else {
      return { valid: false, reason: 'Payment signature mismatch — possible tampering detected' };
    }
  } catch (error) {
    return { valid: false, reason: `Verification error: ${error.message}` };
  }
}

function isMockMode() {
  return MOCK_MODE;
}

module.exports = { createOrder, verifyPayment, getInstance, isMockMode };
