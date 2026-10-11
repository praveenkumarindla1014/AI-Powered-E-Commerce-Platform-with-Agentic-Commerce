const express = require('express');
const router = express.Router();
const { readAuditLogs, clearAuditLogs } = require('../services/auditLogger');

// GET /api/audit — Audit entries, newest first. Optional ?action=&status=&limit=
router.get('/', (req, res) => {
  const { action, status } = req.query;
  const limit = Math.min(1000, Number(req.query.limit) || 1000);

  let logs = readAuditLogs();
  if (action) logs = logs.filter(l => l.action === action);
  if (status) logs = logs.filter(l => l.status === status);

  res.json({ success: true, logs: logs.slice(0, limit), total: logs.length });
});

// DELETE /api/audit — Clear the audit trail
router.delete('/', (req, res) => {
  clearAuditLogs();
  res.json({ success: true, message: 'Audit logs cleared' });
});

module.exports = router;
