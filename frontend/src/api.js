const API_BASE = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Products
export const getProducts = () => request('/products');
export const syncDummyJson = (limit = 50) => request(`/products/sync-dummyjson?limit=${limit}`, { method: 'POST' });
export const resetDefaultProducts = () => request('/products/reset-default', { method: 'POST' });
export const getDiscounts = () => request('/discounts');
export const toggleDiscount = (productId, discount_active, discount_percent) =>
  request('/discounts', {
    method: 'POST',
    body: { productId, discount_active, discount_percent },
  });

// Customers
export const getCustomers = () => request('/customers');
export const logSearch = (customerId, searchTerm) =>
  request('/customers/search-log', {
    method: 'POST',
    body: { customerId, searchTerm },
  });

// AI Suggestion
export const getSuggestion = (customerId, cartItems) =>
  request('/suggest', {
    method: 'POST',
    body: { customerId, cartItems },
  });

export const acceptSuggestion = (customerId, suggestionProductId, suggestionName) =>
  request('/suggest/accept', {
    method: 'POST',
    body: { customerId, suggestionProductId, suggestionName },
  });

export const dismissSuggestion = (customerId, suggestionProductId, suggestionName) =>
  request('/suggest/dismiss', {
    method: 'POST',
    body: { customerId, suggestionProductId, suggestionName },
  });

// Payments
export const createOrder = (amount, cartItems, customerId) =>
  request('/payments/create-order', {
    method: 'POST',
    body: { amount, cartItems, customerId },
  });

export const verifyPayment = (razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, customerId) =>
  request('/payments/verify-payment', {
    method: 'POST',
    body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, customerId },
  });

export const simulateFailure = (amount, customerId) =>
  request('/payments/simulate-failure', {
    method: 'POST',
    body: { amount, customerId },
  });

// Audit
export const getAuditLogs = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return request(`/audit${params ? `?${params}` : ''}`);
};

export const clearAuditLogs = () => request('/audit', { method: 'DELETE' });

// Guardrails
export const getGuardrailConfig = () => request('/guardrails');
export const updateGuardrailConfig = (config) =>
  request('/guardrails', {
    method: 'POST',
    body: config,
  });

// Health
export const healthCheck = () => request('/health');

// ========== GROWTH FEATURES ==========

// Abandoned Cart Recovery
export const triggerAbandonedCart = (customerId, cartItems, cartTotal) =>
  request('/cart/abandon', {
    method: 'POST',
    body: { customerId, cartItems, cartTotal },
  });

export const getRecoveredCarts = () => request('/cart/recovered');

export const getAbandonConfig = () => request('/cart/abandon-config');

// Smart Payment Method Recommender
export const getPaymentMethodSuggestion = (customerId) =>
  request('/payment-method-suggest', {
    method: 'POST',
    body: { customerId },
  });

// EMI/BNPL Suggestion
export const getEmiSuggestion = (cartTotal, customerId) =>
  request('/emi-suggest', {
    method: 'POST',
    body: { cartTotal, customerId },
  });

// AI Shopping Assistant Chat
export const sendAssistantChat = (customerId, message, cartItems = [], cartTotal = 0) =>
  request('/suggest/assistant-chat', {
    method: 'POST',
    body: { customerId, message, cartItems, cartTotal },
  });

// Pending EMI & Security PIN Authorization
export const getPendingEmis = (customerId) => request(`/emi/pending/${customerId}`);

export const payEmiInstallment = (customerId, emiId, installmentNumber, securityPin) =>
  request('/emi/pay-installment', {
    method: 'POST',
    body: { customerId, emiId, installmentNumber, securityPin },
  });


