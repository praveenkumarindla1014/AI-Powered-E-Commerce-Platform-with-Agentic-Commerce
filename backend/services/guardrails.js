/**
 * Guardrails — Deterministic policy checks (NOT LLM-based)
 * These are pure functions that enforce business rules on AI suggestions and payments.
 * The config is persisted so admin changes survive a server restart.
 */
const store = require('./store');

const DEFAULT_CONFIG = {
  maxSuggestionPricePercent: 30,       // Suggested item price ≤ 30% of cart value
  maxAutoApproveAmount: 2000,          // Auto-approve payments up to ₹2000
  abandonedCartTimeout: 60,            // Seconds before a cart is considered abandoned
  emiThreshold: 3000,                  // Minimum cart total to suggest EMI
  enableAbandonedCartRecovery: true,
  enablePaymentMethodReorder: true,
  enableEmiSuggestion: true,
};

// Allowed range for each numeric setting
const LIMITS = {
  maxSuggestionPricePercent: [5, 100],
  maxAutoApproveAmount: [0, 1000000],
  abandonedCartTimeout: [10, 3600],
  emiThreshold: [500, 1000000],
};

const TOGGLES = ['enableAbandonedCartRecovery', 'enablePaymentMethodReorder', 'enableEmiSuggestion'];

const PAYMENT_METHODS = ['UPI', 'Card', 'Netbanking', 'Wallet'];

function getConfig() {
  return { ...DEFAULT_CONFIG, ...store.read('guardrails') };
}

/**
 * Update guardrail config. Unknown keys are ignored, numbers are clamped
 * to sensible ranges, and invalid values keep the previous setting.
 */
function updateConfig(newConfig = {}) {
  const config = getConfig();

  Object.entries(LIMITS).forEach(([field, [min, max]]) => {
    if (newConfig[field] === undefined) return;
    const value = Number(newConfig[field]);
    if (Number.isFinite(value)) {
      config[field] = Math.min(max, Math.max(min, Math.round(value)));
    }
  });

  TOGGLES.forEach(field => {
    if (newConfig[field] !== undefined) config[field] = Boolean(newConfig[field]);
  });

  store.write('guardrails', config);
  return config;
}

/** Highest price a suggested item may have for the given cart value. */
function maxSuggestionPrice(cartValue) {
  return Math.floor((cartValue * getConfig().maxSuggestionPricePercent) / 100);
}

/**
 * Validate an AI suggestion against guardrail rules
 * @param {object} suggestion - { suggestion_product_id, ... }
 * @param {number} cartValue - current cart total in ₹
 * @param {Array} catalog
 * @param {Array<string>} cartProductIds - items already in the cart
 */
function validateSuggestion(suggestion, cartValue, catalog, cartProductIds = []) {
  const product = catalog.find(p => p.id === suggestion.suggestion_product_id);
  if (!product) {
    return {
      valid: false,
      reason: `Product ID "${suggestion.suggestion_product_id}" does not exist in catalog`,
      product: null,
    };
  }

  if (cartProductIds.includes(product.id)) {
    return { valid: false, reason: `"${product.name}" is already in the cart`, product };
  }

  if (product.stock <= 0) {
    return { valid: false, reason: `Product "${product.name}" is out of stock`, product };
  }

  const { maxSuggestionPricePercent } = getConfig();
  const maxAllowedPrice = maxSuggestionPrice(cartValue);
  if (product.price > maxAllowedPrice) {
    return {
      valid: false,
      reason: `Product price ₹${product.price} exceeds ${maxSuggestionPricePercent}% of cart value ₹${cartValue} (max allowed: ₹${maxAllowedPrice})`,
      product,
    };
  }

  return { valid: true, reason: null, product };
}

/** Payments above the threshold need an explicit confirmation step. */
function checkPaymentGate(amount) {
  const threshold = getConfig().maxAutoApproveAmount;
  return { autoApprove: amount <= threshold, threshold };
}

/**
 * Recommended payment method order based on customer profile.
 * DETERMINISTIC — no LLM call. Methods are only reordered, never hidden.
 */
function getPaymentMethodOrder(customer) {
  if (!getConfig().enablePaymentMethodReorder) {
    return { methods: [...PAYMENT_METHODS], reason: 'Default order (feature disabled)', reordered: false };
  }

  let methods;
  let reason;

  if (customer.preferred_method && PAYMENT_METHODS.includes(customer.preferred_method)) {
    const preferred = customer.preferred_method;
    methods = [preferred, ...PAYMENT_METHODS.filter(m => m !== preferred)];
    reason = `${preferred} shown first — it's your preferred payment method`;
  } else if (customer.age < 30) {
    methods = ['UPI', 'Card', 'Wallet', 'Netbanking'];
    reason = 'UPI shown first — fastest for your age group';
  } else if (customer.age <= 45) {
    methods = ['Card', 'UPI', 'Netbanking', 'Wallet'];
    reason = 'Card shown first — most popular for professionals';
  } else {
    methods = ['Netbanking', 'Card', 'UPI', 'Wallet'];
    reason = 'Netbanking shown first — preferred by experienced users';
  }

  return { methods, reason, reordered: true };
}

/** EMI is only suggested above a threshold — never push credit on small purchases. */
function checkEmiEligibility(cartTotal) {
  const { enableEmiSuggestion, emiThreshold } = getConfig();

  if (!enableEmiSuggestion) {
    return { eligible: false, reason: 'EMI suggestion feature disabled', threshold: emiThreshold };
  }

  if (cartTotal < emiThreshold) {
    return {
      eligible: false,
      reason: `Cart total ₹${cartTotal} is below EMI threshold ₹${emiThreshold}`,
      threshold: emiThreshold,
    };
  }

  const emiAmount = Math.ceil(cartTotal / 3);
  return {
    eligible: true,
    emiAmount,
    months: 3,
    threshold: emiThreshold,
    reason: `Carts above ₹${emiThreshold.toLocaleString('en-IN')} can be split into no-cost EMI`,
    message: `Split into 3 easy payments of ₹${emiAmount.toLocaleString('en-IN')}`,
  };
}

function checkAbandonedCartRecovery() {
  const { enableAbandonedCartRecovery, abandonedCartTimeout } = getConfig();
  if (!enableAbandonedCartRecovery) return { enabled: false, timeout: 0 };
  return { enabled: true, timeout: abandonedCartTimeout };
}

module.exports = {
  DEFAULT_CONFIG,
  getConfig,
  updateConfig,
  maxSuggestionPrice,
  validateSuggestion,
  checkPaymentGate,
  getPaymentMethodOrder,
  checkEmiEligibility,
  checkAbandonedCartRecovery,
};
