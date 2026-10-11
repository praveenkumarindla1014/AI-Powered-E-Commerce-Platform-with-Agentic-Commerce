/**
 * Orders — records every checkout attempt and applies the side effects of a
 * successful payment (stock, purchase history, abandoned-cart recovery).
 */
const store = require('./store');

function listOrders(customerId) {
  const orders = store.read('orders');
  return customerId ? orders.filter(o => o.customerId === customerId) : orders;
}

function getOrder(orderId) {
  return store.read('orders').find(o => o.id === orderId) || null;
}

function saveOrder(order) {
  const orders = store.read('orders');
  const index = orders.findIndex(o => o.id === order.id);
  if (index === -1) orders.unshift(order);
  else orders[index] = order;
  store.write('orders', orders);
  return order;
}

/** Build and persist an order record from a priced cart. */
function createOrderRecord({ gatewayOrder, customer, pricing, channel, recoveryLinkId = null, simulation = false }) {
  return saveOrder({
    id: gatewayOrder.id,
    customerId: customer.id,
    customerName: customer.name,
    items: pricing.lines,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    total: pricing.total,
    status: 'created', // created | paid | failed
    channel,           // checkout | pin | assistant | simulation
    mock: Boolean(gatewayOrder.mock),
    simulation,
    recoveryLinkId,
    paymentId: null,
    method: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  });
}

function markFailed(order, reason) {
  order.status = 'failed';
  order.failureReason = reason;
  return saveOrder(order);
}

/** Mark paid and apply side effects. Returns the updated order. */
function markPaid(order, { paymentId, method }) {
  order.status = 'paid';
  order.paymentId = paymentId;
  order.method = method || null;
  order.paidAt = new Date().toISOString();
  order.failureReason = null;
  saveOrder(order);

  // 1. Reduce stock
  const products = store.read('products');
  order.items.forEach(line => {
    const product = products.find(p => p.id === line.id);
    if (product) product.stock = Math.max(0, product.stock - line.quantity);
  });
  store.write('products', products);

  // 2. Remember purchases so future suggestions learn from them
  const customers = store.read('customers');
  const customer = customers.find(c => c.id === order.customerId);
  if (customer) {
    const names = order.items.map(l => l.name);
    customer.last_purchases = [...new Set([...names, ...customer.last_purchases])].slice(0, 6);
    store.write('customers', customers);
  }

  // 3. Close any open abandoned-cart recovery links for this customer
  const carts = store.read('abandoned_carts');
  let changed = false;
  carts.forEach(cart => {
    if (cart.customerId === order.customerId && cart.status === 'pending') {
      cart.status = cart.id === order.recoveryLinkId ? 'recovered' : 'closed';
      cart.orderId = order.id;
      changed = true;
    }
  });
  if (changed) store.write('abandoned_carts', carts);

  return order;
}

module.exports = { listOrders, getOrder, saveOrder, createOrderRecord, markPaid, markFailed };
