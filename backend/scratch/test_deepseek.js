require('dotenv').config();
const { getSuggestion } = require('../services/openaiService');
const catalog = require('../data/products.json');
const customer = require('../data/customers.json')[0];

getSuggestion({
  customer,
  cartItem: catalog[1],
  catalog
}).then(res => {
  console.log('GET SUGGESTION RESULT:', res);
}).catch(console.error);
