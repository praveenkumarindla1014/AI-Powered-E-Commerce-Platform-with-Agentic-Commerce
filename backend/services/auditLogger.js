const { v4: uuidv4 } = require('uuid');
const store = require('./store');

const MAX_ENTRIES = 1000;

function readAuditLogs() {
  return store.read('audit_logs');
}

function clearAuditLogs() {
  store.write('audit_logs', []);
}

/** Audit entries show customer names; accept either an id or a name. */
function resolveCustomerName(customer) {
  if (!customer) return null;
  if (typeof customer === 'object') return customer.name || customer.id || null;
  if (String(customer).startsWith('cust_')) {
    const found = store.read('customers').find(c => c.id === customer);
    if (found) return found.name;
  }
  return customer;
}

/**
 * Log an audit entry
 * @param {string} action - e.g. "suggestion_generated", "suggestion_blocked", "payment_success"
 * @param {object} details - { status, customer, amount, reasoning, details }
 */
function logAudit(action, details = {}) {
  const { status = 'info', customer = null, amount = null, reasoning = null, details: extra = {} } = details;

  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action,
    reasoning,
    amount: amount ?? null,
    status,
    customer: resolveCustomerName(customer),
    details: extra,
  };

  const logs = readAuditLogs();
  logs.unshift(entry); // newest first
  store.write('audit_logs', logs.slice(0, MAX_ENTRIES));
  return entry;
}

module.exports = { readAuditLogs, clearAuditLogs, logAudit };
