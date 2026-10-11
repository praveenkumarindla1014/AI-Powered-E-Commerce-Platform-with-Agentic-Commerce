/**
 * Customer profile helpers shared by the suggestion engine, the assistant
 * and the payment-method recommender.
 */

const SEGMENTS = [
  {
    key: 'young',
    maxAge: 29,
    label: 'Under 30 — Tech, Gaming & Fashion',
    categories: ['electronics', 'gaming', 'fashion'],
  },
  {
    key: 'professional',
    maxAge: 45,
    label: '30–45 — Home, Ergonomics & Fitness',
    categories: ['home', 'health', 'electronics'],
  },
  {
    key: 'senior',
    maxAge: Infinity,
    label: '45+ — Health, Comfort & Wellness',
    categories: ['health', 'home'],
  },
];

function ageSegment(age) {
  return SEGMENTS.find(s => age <= s.maxAge);
}

/** Price band of the customer's past purchases that still exist in the catalog. */
function purchaseHistory(customer, catalog) {
  const items = catalog.filter(p => customer.last_purchases.includes(p.name));
  if (items.length === 0) {
    return { minPrice: 500, maxPrice: 4000, avgPrice: 2000, items: [] };
  }
  const prices = items.map(p => p.price);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    items,
  };
}

// Wrong-PIN attempts per customer: { count, firstAt }
const pinFailures = new Map();
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 10 * 60 * 1000;

/**
 * Check a customer's security PIN on the server (never in the browser).
 * Locks the customer out for 10 minutes after 5 wrong attempts.
 */
function verifyPin(customer, pin) {
  const now = Date.now();
  const record = pinFailures.get(customer.id);
  if (record && now - record.firstAt > PIN_LOCK_MS) pinFailures.delete(customer.id);

  const failures = pinFailures.get(customer.id);
  if (failures && failures.count >= MAX_PIN_ATTEMPTS) {
    return { ok: false, locked: true, reason: 'Too many wrong PIN attempts. Try again in 10 minutes.' };
  }

  if (customer.security_pin && String(pin ?? '') === String(customer.security_pin)) {
    pinFailures.delete(customer.id);
    return { ok: true };
  }

  const next = failures ? { ...failures, count: failures.count + 1 } : { count: 1, firstAt: now };
  pinFailures.set(customer.id, next);
  const left = MAX_PIN_ATTEMPTS - next.count;
  return {
    ok: false,
    locked: left <= 0,
    reason: left > 0 ? `Incorrect PIN — ${left} attempt${left === 1 ? '' : 's'} left` : 'Too many wrong PIN attempts. Try again in 10 minutes.',
  };
}

/** Never expose secrets (the demo security PIN) to the browser. */
function publicCustomer(customer) {
  const { security_pin, ...rest } = customer;
  const { key, label, categories } = ageSegment(customer.age);
  return { ...rest, segment: { key, label, categories } };
}

module.exports = { ageSegment, purchaseHistory, publicCustomer, verifyPin };
