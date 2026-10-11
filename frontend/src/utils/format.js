// Formatting and pricing helpers. Pricing mirrors backend/services/pricing.js;
// the server always recomputes totals at checkout.

export function formatINR(amount) {
  return `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

export function hasDiscount(product) {
  return Boolean(product?.discount_active) && Number(product?.discount_percent) > 0;
}

export function unitPrice(product) {
  if (!hasDiscount(product)) return product.price;
  return Math.round(product.price * (1 - product.discount_percent / 100));
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Shared demo security PIN for every persona (verified on the server). */
export const DEMO_PIN = '1234';
