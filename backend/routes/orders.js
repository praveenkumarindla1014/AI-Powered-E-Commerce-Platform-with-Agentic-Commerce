const express = require('express');
const router = express.Router();
const orders = require('../services/orders');

// GET /api/orders?customerId=cust_001 — Order history, newest first
router.get('/', (req, res) => {
  const list = orders.listOrders(req.query.customerId);
  res.json({ success: true, orders: list, total: list.length });
});

// GET /api/orders/:id — Single order
router.get('/:id', (req, res) => {
  const order = orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  res.json({ success: true, order });
});

module.exports = router;
