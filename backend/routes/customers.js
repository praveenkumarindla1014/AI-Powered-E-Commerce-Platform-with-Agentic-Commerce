const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { logAudit } = require('../services/auditLogger');
const { publicCustomer, purchaseHistory } = require('../services/profile');

function withPriceBand(customer, catalog) {
  const history = purchaseHistory(customer, catalog);
  return {
    ...publicCustomer(customer),
    priceBand: { min: history.minPrice, max: history.maxPrice, avg: history.avgPrice },
  };
}

// GET /api/customers — Demo customer personas (without secrets)
router.get('/', (req, res) => {
  const catalog = store.read('products');
  const customers = store.read('customers').map(c => withPriceBand(c, catalog));
  res.json({ success: true, customers });
});

// POST /api/customers/search-log — Remember what a customer searched for
router.post('/search-log', (req, res) => {
  const { customerId } = req.body;
  const searchTerm = String(req.body.searchTerm || '').trim().slice(0, 60);

  if (!customerId || !searchTerm) {
    return res.status(400).json({ success: false, error: 'customerId and searchTerm are required' });
  }

  const customers = store.read('customers');
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  // Most recent first, no duplicates, keep the last 5
  const others = customer.last_searches.filter(s => s.toLowerCase() !== searchTerm.toLowerCase());
  customer.last_searches = [searchTerm, ...others].slice(0, 5);
  store.write('customers', customers);

  logAudit('search_logged', {
    status: 'info',
    customer: customer.name,
    reasoning: `${customer.name} searched for "${searchTerm}"`,
  });

  res.json({ success: true, customer: withPriceBand(customer, store.read('products')) });
});

module.exports = router;
