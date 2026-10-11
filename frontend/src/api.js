// Relative URL: Vite proxies /api to the backend in development
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the ShopMind server. Is the backend running?', 0);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = data?.error || (response.status >= 500
      ? 'The server ran into a problem. Please try again.'
      : `Request failed (${response.status})`);
    throw new ApiError(message, response.status, data);
  }
  return data;
}

const toItems = cart => cart.map(({ id, quantity }) => ({ id, quantity }));

// Health
export const getHealth = () => request('/health');

// Products
export const getProducts = () => request('/products');
export const syncDummyJson = (limit = 30) => request(`/products/sync-dummyjson?limit=${limit}`, { method: 'POST' });
export const resetCatalog = () => request('/products/reset', { method: 'POST' });
export const updateDiscount = (productId, changes) =>
  request(`/products/${productId}/discount`, { method: 'PATCH', body: changes });

// Customers
export const getCustomers = () => request('/customers');
export const logSearch = (customerId, searchTerm) =>
  request('/customers/search-log', { method: 'POST', body: { customerId, searchTerm } });

// AI cross-sell suggestion
export const getSuggestion = (customerId, cart, excludeIds = []) =>
  request('/suggest', { method: 'POST', body: { customerId, cartItems: toItems(cart), excludeIds } });
export const acceptSuggestion = (customerId, suggestionProductId, suggestionName) =>
  request('/suggest/accept', { method: 'POST', body: { customerId, suggestionProductId, suggestionName } });
export const dismissSuggestion = (customerId, suggestionProductId, suggestionName) =>
  request('/suggest/dismiss', { method: 'POST', body: { customerId, suggestionProductId, suggestionName } });

// Assistant (the server keeps the conversation and memory per customer)
export const sendAssistantMessage = (customerId, message, cart, currentProductId = null) =>
  request('/assistant/chat', { method: 'POST', body: { customerId, message, cartItems: toItems(cart), currentProductId } });
export const getAssistantMemory = customerId => request(`/assistant/memory/${encodeURIComponent(customerId)}`);
export const forgetAssistantFact = (customerId, type, value) =>
  request(`/assistant/memory/${encodeURIComponent(customerId)}/forget`, { method: 'POST', body: { type, value } });
export const clearAssistantMemory = customerId =>
  request(`/assistant/memory/${encodeURIComponent(customerId)}`, { method: 'DELETE' });

// Payments
export const createOrder = (customerId, cart, { confirmed = false, recoveryLinkId = null } = {}) =>
  request('/payments/create-order', { method: 'POST', body: { customerId, cartItems: toItems(cart), confirmed, recoveryLinkId } });
export const verifyPayment = ({ orderId, paymentId, signature, method }) =>
  request('/payments/verify-payment', {
    method: 'POST',
    body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, method },
  });
export const reportPaymentFailure = (orderId, reason) =>
  request('/payments/report-failure', { method: 'POST', body: { orderId, reason } });
export const pinPay = (customerId, cart, pin, { channel = 'pin', recoveryLinkId = null } = {}) =>
  request('/payments/pin-pay', { method: 'POST', body: { customerId, cartItems: toItems(cart), pin, channel, recoveryLinkId } });
export const simulateFailure = (customerId, cart) =>
  request('/payments/simulate-failure', { method: 'POST', body: { customerId, cartItems: toItems(cart) } });

// Orders
export const getOrders = customerId => request(`/orders?customerId=${encodeURIComponent(customerId)}`);

// Audit
export const getAuditLogs = () => request('/audit');
export const clearAuditLogs = () => request('/audit', { method: 'DELETE' });

// Guardrails & admin
export const getGuardrailConfig = () => request('/guardrails');
export const updateGuardrailConfig = config => request('/guardrails', { method: 'POST', body: config });
export const resetDemoData = () => request('/admin/reset-demo', { method: 'POST' });

// Growth features
export const getAbandonConfig = () => request('/cart/abandon-config');
export const triggerAbandonedCart = (customerId, cart) =>
  request('/cart/abandon', { method: 'POST', body: { customerId, cartItems: toItems(cart) } });
export const openRecoveryLink = linkId => request(`/cart/recover/${encodeURIComponent(linkId)}`);
export const getRecoveredCarts = () => request('/cart/recovered');
export const getPaymentMethodSuggestion = customerId =>
  request('/payment-method-suggest', { method: 'POST', body: { customerId } });
export const getEmiSuggestion = (cartTotal, customerId) =>
  request('/emi-suggest', { method: 'POST', body: { cartTotal, customerId } });

// EMI installments
export const getEmis = customerId => request(`/emi/pending/${encodeURIComponent(customerId)}`);
export const payEmiInstallment = (customerId, emiId, installmentNumber, securityPin) =>
  request('/emi/pay-installment', { method: 'POST', body: { customerId, emiId, installmentNumber, securityPin } });
