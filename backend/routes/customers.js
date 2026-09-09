const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { logAudit } = require('../services/auditLogger');

const CUSTOMERS_FILE = path.join(__dirname, '..', 'data', 'customers.json');

function readCustomers() {
  const data = fs.readFileSync(CUSTOMERS_FILE, 'utf-8');
  return JSON.parse(data);
}

function writeCustomers(customers) {
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
}

// GET /api/customers — List demo customer profiles
router.get('/', (req, res) => {
  try {
    const customers = readCustomers();
    res.json({ success: true, customers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/search-log — Log a search term for a customer
router.post('/search-log', (req, res) => {
  try {
    const { customerId, searchTerm } = req.body;

    if (!customerId || !searchTerm) {
      return res.status(400).json({ success: false, error: 'customerId and searchTerm are required' });
    }

    const customers = readCustomers();
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // Add search term (keep last 10)
    customer.last_searches.unshift(searchTerm);
    customer.last_searches = customer.last_searches.slice(0, 10);

    writeCustomers(customers);

    logAudit('search_logged', {
      status: 'info',
      customer: customer.name,
      reasoning: `Customer "${customer.name}" searched for "${searchTerm}"`
    });

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
