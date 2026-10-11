const express = require('express');
const router = express.Router();
const store = require('../services/store');
const guardrails = require('../services/guardrails');
const { logAudit } = require('../services/auditLogger');

// GET /api/guardrails — Current guardrail & growth feature settings
router.get('/guardrails', (req, res) => {
  res.json({ success: true, config: guardrails.getConfig(), defaults: guardrails.DEFAULT_CONFIG });
});

// POST /api/guardrails — Update settings (values are validated and clamped)
router.post('/guardrails', (req, res) => {
  const before = guardrails.getConfig();
  const config = guardrails.updateConfig(req.body);

  const changes = Object.keys(config)
    .filter(key => before[key] !== config[key])
    .map(key => `${key}: ${before[key]} → ${config[key]}`);

  if (changes.length > 0) {
    logAudit('guardrails_updated', { status: 'info', reasoning: `Admin changed ${changes.join(', ')}` });
  }

  res.json({ success: true, config });
});

// POST /api/admin/reset-demo — Restore demo data to its seed state (the audit trail is kept)
router.post('/admin/reset-demo', (req, res) => {
  ['products', 'customers', 'emi_records', 'abandoned_carts', 'orders', 'guardrails', 'assistant_memory'].forEach(store.reset);
  logAudit('demo_reset', { status: 'info', reasoning: 'All demo data (catalog, customers, orders, EMIs, settings) restored to defaults' });
  res.json({ success: true, message: 'Demo data restored' });
});

module.exports = router;
