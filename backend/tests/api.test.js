/**
 * End-to-end API tests against a throwaway copy of the seed data.
 * Run with: npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopmind-test-'));
process.env.SHOPMIND_DATA_DIR = tmpDir;
// Force offline mode: rules engine + built-in test checkout
process.env.OPENAI_API_KEY = '';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';

const store = require('../services/store');
const app = require('../server');

let server;
let base;

before(async () => {
  store.init();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('customers never expose the security PIN', async () => {
  const { body } = await api('GET', '/customers');
  assert.ok(body.customers.length > 0);
  body.customers.forEach(c => assert.equal(c.security_pin, undefined));
});

test('suggestion respects the price-cap guardrail and excludes cart items', async () => {
  const { body } = await api('POST', '/suggest', { customerId: 'cust_003', cartItems: [{ id: 'prod_016', quantity: 1 }] });
  assert.ok(body.suggestion, 'expected a suggestion');
  assert.notEqual(body.product.id, 'prod_016');
  assert.ok(body.product.price <= Math.floor(2799 * 0.3));
});

test('server prices the cart itself and gates large payments', async () => {
  // prod_004 costs ₹5,999 — above the ₹2,000 auto-approve threshold
  const gated = await api('POST', '/payments/create-order', { customerId: 'cust_001', cartItems: [{ id: 'prod_004', quantity: 1 }], amount: 1 });
  assert.equal(gated.body.requiresConfirmation, true);
  assert.equal(gated.body.total, 5999);

  const confirmed = await api('POST', '/payments/create-order', { customerId: 'cust_001', cartItems: [{ id: 'prod_004', quantity: 1 }], confirmed: true });
  assert.equal(confirmed.body.success, true);
  assert.equal(confirmed.body.order.total, 5999);
});

test('verify-payment marks the order paid once and reduces stock', async () => {
  const stockBefore = store.read('products').find(p => p.id === 'prod_009').stock;
  const created = await api('POST', '/payments/create-order', { customerId: 'cust_003', cartItems: [{ id: 'prod_009', quantity: 2 }] });
  const orderId = created.body.order.id;

  const payload = { razorpay_order_id: orderId, razorpay_payment_id: 'pay_test', razorpay_signature: 'mock_valid_signature' };
  const first = await api('POST', '/payments/verify-payment', payload);
  const second = await api('POST', '/payments/verify-payment', payload);

  assert.equal(first.body.order.status, 'paid');
  assert.equal(second.body.message, 'Order already paid');
  assert.equal(store.read('products').find(p => p.id === 'prod_009').stock, stockBefore - 2);
});

test('a declined payment is recorded as failed without charging', async () => {
  const sim = await api('POST', '/payments/simulate-failure', { customerId: 'cust_002', cartItems: [{ id: 'prod_013', quantity: 1 }] });
  const res = await api('POST', '/payments/verify-payment', {
    razorpay_order_id: sim.body.order.id, razorpay_payment_id: 'pay_fail', razorpay_signature: 'mock_invalid_signature',
  });
  assert.equal(res.status, 402);
  assert.equal(res.body.order.status, 'failed');
});

test('PIN payments are verified on the server', async () => {
  const wrong = await api('POST', '/payments/pin-pay', { customerId: 'cust_004', cartItems: [{ id: 'prod_007', quantity: 1 }], pin: '0000' });
  assert.equal(wrong.status, 401);

  const right = await api('POST', '/payments/pin-pay', { customerId: 'cust_004', cartItems: [{ id: 'prod_007', quantity: 1 }], pin: '1234' });
  assert.equal(right.body.order.status, 'paid');
});

test('EMI installments must be paid in order with the correct PIN', async () => {
  const { body } = await api('GET', '/emi/pending/cust_001');
  const plan = body.emis[0];
  const next = plan.nextDue.installmentNumber;

  const outOfOrder = await api('POST', '/emi/pay-installment', { customerId: 'cust_001', emiId: plan.id, installmentNumber: next + 1, securityPin: '1234' });
  assert.equal(outOfOrder.status, 409);

  const paid = await api('POST', '/emi/pay-installment', { customerId: 'cust_001', emiId: plan.id, installmentNumber: next, securityPin: '1234' });
  assert.equal(paid.body.installment.status, 'paid');
});

test('assistant refuses to take payment for an empty cart', async () => {
  const { body } = await api('POST', '/assistant/chat', { customerId: 'cust_001', message: 'make payment', cartItems: [] });
  assert.equal(body.intent, 'pay');
  assert.equal(body.payment, undefined);
});

test('assistant fallback respects a budget', async () => {
  const { body } = await api('POST', '/assistant/chat', { customerId: 'cust_002', message: 'suggest items under 1000', cartItems: [] });
  assert.ok(body.recommendations.length > 0);
  body.recommendations.forEach(r => assert.ok(r.finalPrice <= 1000));
});

test('assistant remembers budget and interests across messages', async () => {
  await api('DELETE', '/assistant/memory/cust_004');
  const first = await api('POST', '/assistant/chat', { customerId: 'cust_004', message: 'I love fashion, show me hoodies under 2000', cartItems: [] });
  assert.ok(first.body.learned.some(l => l.includes('budget')));

  // No budget in this message — the remembered ₹2,000 still applies
  const second = await api('POST', '/assistant/chat', { customerId: 'cust_004', message: 'what would suit me?', cartItems: [] });
  assert.ok(second.body.reply.includes('usual budget'));
  second.body.recommendations.forEach(r => assert.ok(r.finalPrice <= 2000));

  const memory = await api('GET', '/assistant/memory/cust_004');
  assert.equal(memory.body.facts.budget, 2000);
  assert.ok(memory.body.facts.interests.includes('fashion'));
  assert.equal(memory.body.messages.length, 4);
});

test('shoppers can forget facts and clear memory', async () => {
  const forgot = await api('POST', '/assistant/memory/cust_004/forget', { type: 'budget' });
  assert.equal(forgot.body.facts.budget, null);

  await api('DELETE', '/assistant/memory/cust_004');
  const memory = await api('GET', '/assistant/memory/cust_004');
  assert.equal(memory.body.messages.length, 0);
});

test('assistant answers questions about the product on screen', async () => {
  const { body } = await api('POST', '/assistant/chat', { customerId: 'cust_003', message: 'is this in stock?', cartItems: [], currentProductId: 'prod_016' });
  assert.match(body.reply, /Walking Comfort Shoes costs ₹2,799/);
});

test('guardrail settings are clamped and persisted', async () => {
  const { body } = await api('POST', '/guardrails', { maxSuggestionPricePercent: 500, emiThreshold: 'abc' });
  assert.equal(body.config.maxSuggestionPricePercent, 100);
  assert.equal(body.config.emiThreshold, 3000);
  assert.equal(store.read('guardrails').maxSuggestionPricePercent, 100);
});

test('recovery links restore the saved cart', async () => {
  const created = await api('POST', '/cart/abandon', { customerId: 'cust_002', cartItems: [{ id: 'prod_010', quantity: 1 }] });
  assert.match(created.body.recoveryLink, /\/recover\/rcv_/);

  const opened = await api('GET', `/cart/recover/${created.body.linkId}`);
  assert.equal(opened.body.cart.cartItems[0].id, 'prod_010');
});
