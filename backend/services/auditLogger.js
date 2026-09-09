const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit_logs.json');

function readAuditLogs() {
  try {
    const data = fs.readFileSync(AUDIT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeAuditLogs(logs) {
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2));
}

/**
 * Log an audit entry
 * @param {string} action - e.g. "suggestion_generated", "suggestion_blocked", "payment_success"
 * @param {object} details - arbitrary detail object
 */
function logAudit(action, details = {}) {
  const logs = readAuditLogs();
  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action,
    reasoning: details.reasoning || null,
    amount: details.amount || null,
    status: details.status || 'info',
    customer: details.customer || null,
    details: details
  };
  logs.unshift(entry); // newest first
  writeAuditLogs(logs);
  return entry;
}

module.exports = { readAuditLogs, logAudit };
