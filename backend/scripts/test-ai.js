/**
 * Quick check that the configured AI provider answers suggestion requests.
 * Usage: npm run test:ai   (from backend/)
 */
require('dotenv').config();
const store = require('../services/store');
const { getSuggestion, isConfigured } = require('../services/openaiService');
const { ageSegment } = require('../services/profile');

store.init();

if (!isConfigured()) {
  console.log('OPENAI_API_KEY is not set — the app will use the rules engine.');
  process.exit(0);
}

const catalog = store.read('products');
const customer = store.read('customers')[0];
const cartProduct = catalog.find(p => p.id === 'prod_002');

getSuggestion({
  customer,
  cartProducts: [cartProduct],
  cartValue: cartProduct.price,
  maxPrice: Math.floor(cartProduct.price * 0.3),
  catalog: catalog.filter(p => p.id !== cartProduct.id),
  segment: ageSegment(customer.age),
}).then(result => {
  console.log('Suggestion:', result);
});
