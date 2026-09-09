require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

// Import routes
const productsRouter = require('./routes/products');
const customersRouter = require('./routes/customers');
const suggestRouter = require('./routes/suggest');
const paymentsRouter = require('./routes/payments');
const auditRouter = require('./routes/audit');
const growthRouter = require('./routes/growth');

// Import services
const guardrails = require('./services/guardrails');

// Mount routes
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suggest', suggestRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/audit', auditRouter);
app.use('/api', growthRouter); // Growth features: /api/cart/abandon, /api/payment-method-suggest, /api/emi-suggest

// Discount routes
app.get('/api/discounts', (req, res) => {
  const fs = require('fs');
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf-8'));
  const discounts = products.map(p => ({
    id: p.id, name: p.name, price: p.price,
    discount_percent: p.discount_percent, discount_active: p.discount_active
  }));
  res.json({ success: true, discounts });
});

app.post('/api/discounts', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'data', 'products.json');
  const products = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const { productId, discount_active, discount_percent } = req.body;
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  if (discount_active !== undefined) product.discount_active = discount_active;
  if (discount_percent !== undefined) product.discount_percent = Number(discount_percent);
  fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
  res.json({ success: true, product });
});

// Guardrail config endpoints
app.get('/api/guardrails', (req, res) => {
  res.json({ success: true, config: guardrails.getConfig() });
});

app.post('/api/guardrails', (req, res) => {
  const updated = guardrails.updateConfig(req.body);
  res.json({ success: true, config: updated });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'ShopMind AI Backend',
    timestamp: new Date().toISOString(),
    openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here',
    openai_base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    razorpay: !!process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'your_test_key_id_here'
  });
});

// Error handlers
process.on('uncaughtException', (err) => {
  console.error('Server uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Server unhandledRejection:', reason);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🧠 ShopMind AI Backend running on http://localhost:${PORT}`);
  console.log(`   OpenAI:   ${process.env.OPENAI_API_KEY ? '✅ Configured' : '⚠️  Not set (mock mode)'}`);
  console.log(`   AI Base:  ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
  console.log(`   Razorpay: ${process.env.RAZORPAY_KEY_ID ? '✅ Configured' : '⚠️  Not set (mock mode)'}`);
  console.log(`\n   API Endpoints:`);
  console.log(`   GET  /api/products`);
  console.log(`   GET  /api/customers`);
  console.log(`   POST /api/suggest`);
  console.log(`   POST /api/suggest/assistant-chat`);
  console.log(`   POST /api/payments/create-order`);
  console.log(`   POST /api/payments/verify-payment`);
  console.log(`   POST /api/payments/simulate-failure`);
  console.log(`   GET  /api/audit`);
  console.log(`   GET  /api/guardrails`);
  console.log(`   --- Growth Features ---`);
  console.log(`   POST /api/cart/abandon`);
  console.log(`   GET  /api/cart/recovered`);
  console.log(`   POST /api/payment-method-suggest`);
  console.log(`   POST /api/emi-suggest\n`);
});
