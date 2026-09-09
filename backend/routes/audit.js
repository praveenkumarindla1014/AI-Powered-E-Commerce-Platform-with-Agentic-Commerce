const express = require('express');
const router = express.Router();
const { readAuditLogs } = require('../services/auditLogger');

// GET /api/audit — Fetch all audit log entries (newest first)
router.get('/', (req, res) => {
  try {
    const logs = readAuditLogs();

    // Optional filtering
    const { action, status } = req.query;
    let filtered = logs;

    if (action) {
      filtered = filtered.filter(l => l.action === action);
    }
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }

    res.json({ success: true, logs: filtered, total: filtered.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/audit — Clear audit logs (for testing)
router.delete('/', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'audit_logs.json'), '[]');
    res.json({ success: true, message: 'Audit logs cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
