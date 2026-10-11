require('dotenv').config();
const express = require('express');
const cors = require('cors');

const store = require('./services/store');
const { isConfigured: aiConfigured } = require('./services/openaiService');
const { isMockMode } = require('./services/razorpayService');

const app = express();
const PORT = process.env.PORT || 5000;

// Create runtime data files from data/seed on first start
store.init();

app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:5173'],
}));
app.use(express.json({ limit: '100kb' }));

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suggest', require('./routes/suggest'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api', require('./routes/growth')); // /api/cart/*, /api/payment-method-suggest, /api/emi*
app.use('/api', require('./routes/admin'));  // /api/guardrails, /api/admin/*

// Health check — also tells the UI which integrations are live
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'ShopMind AI Backend',
    timestamp: new Date().toISOString(),
    ai: aiConfigured(),
    razorpay: !isMockMode(),
  });
});

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `No API route for ${req.method} ${req.originalUrl}` });
});

// Central error handler — malformed JSON, unexpected exceptions
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Request body is not valid JSON' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Something went wrong on our side. Please try again.' });
});

process.on('unhandledRejection', reason => {
  console.error('Unhandled promise rejection:', reason);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🧠 ShopMind AI backend running on http://localhost:${PORT}`);
    console.log(`   AI provider: ${aiConfigured() ? `✅ ${process.env.OPENAI_BASE_URL || 'OpenAI'}` : '⚠️  not configured — using rules engine'}`);
    console.log(`   Razorpay:    ${isMockMode() ? '⚠️  no keys — using built-in test checkout' : '✅ test keys configured'}\n`);
  });
}

module.exports = app;
