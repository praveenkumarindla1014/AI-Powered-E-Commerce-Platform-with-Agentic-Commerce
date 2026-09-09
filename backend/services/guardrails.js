/**
 * Guardrails — Deterministic policy checks (NOT LLM-based)
 * These are pure functions that enforce business rules on AI suggestions and payments.
 */

// Default config — can be updated via admin panel
let guardrailConfig = {
  maxSuggestionPricePercent: 30,       // Suggested item price ≤ 30% of cart value
  maxAutoApproveAmount: 2000,          // Auto-approve payments under ₹2000
  maxSuggestionsPerRequest: 1,         // Only 1 suggestion at a time
  // New features config
  abandonedCartTimeout: 60,            // Seconds before cart is considered abandoned
  emiThreshold: 3000,                  // Minimum cart total to suggest EMI
  enableAbandonedCartRecovery: true,   // Toggle feature
  enablePaymentMethodReorder: true,    // Toggle feature
  enableEmiSuggestion: true,           // Toggle feature
};

/**
 * Get current guardrail config
 */
function getConfig() {
  return { ...guardrailConfig };
}

/**
 * Update guardrail config
 */
function updateConfig(newConfig) {
  const fields = [
    'maxSuggestionPricePercent', 'maxAutoApproveAmount',
    'abandonedCartTimeout', 'emiThreshold'
  ];
  fields.forEach(field => {
    if (newConfig[field] !== undefined) {
      guardrailConfig[field] = Number(newConfig[field]);
    }
  });

  const toggles = ['enableAbandonedCartRecovery', 'enablePaymentMethodReorder', 'enableEmiSuggestion'];
  toggles.forEach(field => {
    if (newConfig[field] !== undefined) {
      guardrailConfig[field] = Boolean(newConfig[field]);
    }
  });

  return getConfig();
}

/**
 * Validate an AI suggestion against guardrail rules
 */
function validateSuggestion(suggestion, cartValue, catalog) {
  const product = catalog.find(p => p.id === suggestion.suggestion_product_id);
  if (!product) {
    return {
      valid: false,
      reason: `Product ID "${suggestion.suggestion_product_id}" does not exist in catalog`,
      product: null
    };
  }

  if (product.stock <= 0) {
    return {
      valid: false,
      reason: `Product "${product.name}" is out of stock`,
      product
    };
  }

  const maxAllowedPrice = (cartValue * guardrailConfig.maxSuggestionPricePercent) / 100;
  if (product.price > maxAllowedPrice) {
    return {
      valid: false,
      reason: `Product price ₹${product.price} exceeds ${guardrailConfig.maxSuggestionPricePercent}% of cart value ₹${cartValue} (max allowed: ₹${maxAllowedPrice.toFixed(0)})`,
      product
    };
  }

  return { valid: true, reason: null, product };
}

/**
 * Check if a payment should be auto-approved or gated
 */
function checkPaymentGate(amount) {
  return {
    autoApprove: amount <= guardrailConfig.maxAutoApproveAmount,
    threshold: guardrailConfig.maxAutoApproveAmount
  };
}

/**
 * Get recommended payment method order based on customer profile
 * DETERMINISTIC — no LLM call
 */
function getPaymentMethodOrder(customer) {
  if (!guardrailConfig.enablePaymentMethodReorder) {
    return {
      methods: ['UPI', 'Card', 'Netbanking', 'Wallet'],
      reason: 'Default order (feature disabled)',
      reordered: false
    };
  }

  let methods;
  let reason;

  // Check for preferred method first
  if (customer.preferred_method) {
    const allMethods = ['UPI', 'Card', 'Netbanking', 'Wallet'];
    const preferred = customer.preferred_method;
    methods = [preferred, ...allMethods.filter(m => m !== preferred)];
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

  // GUARDRAIL: Never hide any method, only reorder
  return { methods, reason, reordered: true };
}

/**
 * Check if EMI suggestion should be shown
 */
function checkEmiEligibility(cartTotal) {
  if (!guardrailConfig.enableEmiSuggestion) {
    return { eligible: false, reason: 'EMI suggestion feature disabled' };
  }

  if (cartTotal < guardrailConfig.emiThreshold) {
    return {
      eligible: false,
      reason: `Cart total ₹${cartTotal} is below EMI threshold ₹${guardrailConfig.emiThreshold}`
    };
  }

  const emiAmount = Math.round(cartTotal / 3);
  return {
    eligible: true,
    emiAmount,
    months: 3,
    reason: `Cart qualifies for EMI — many customers prefer splitting payments over ₹${guardrailConfig.emiThreshold}`,
    message: `Split into 3 easy payments of ₹${emiAmount.toLocaleString()}`
  };
}

/**
 * Check if abandoned cart recovery should be triggered
 */
function checkAbandonedCartRecovery() {
  if (!guardrailConfig.enableAbandonedCartRecovery) {
    return { enabled: false, timeout: 0 };
  }
  return {
    enabled: true,
    timeout: guardrailConfig.abandonedCartTimeout
  };
}

module.exports = {
  getConfig,
  updateConfig,
  validateSuggestion,
  checkPaymentGate,
  getPaymentMethodOrder,
  checkEmiEligibility,
  checkAbandonedCartRecovery
};
