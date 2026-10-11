const express = require('express');
const router = express.Router();
const store = require('../services/store');
const ai = require('../services/openaiService');
const { validateSuggestion, maxSuggestionPrice, getConfig } = require('../services/guardrails');
const { priceCart } = require('../services/pricing');
const { ageSegment } = require('../services/profile');
const { rankCrossSell, toSuggestion } = require('../services/recommender');
const { logAudit } = require('../services/auditLogger');

/**
 * POST /api/suggest — One explainable cross-sell suggestion for the cart.
 *
 * 1. The AI (or the rules engine when AI is unavailable) proposes its best match.
 * 2. Deterministic guardrails validate the proposal.
 * 3. If it is blocked, the block is logged and the best match that DOES fit
 *    the guardrails is offered instead — so the shopper sees why.
 */
router.post('/', async (req, res) => {
  const { customerId, cartItems, excludeIds = [] } = req.body;

  if (!customerId || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ success: false, error: 'customerId and a non-empty cartItems list are required' });
  }

  const customer = store.read('customers').find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  const catalog = store.read('products');
  const pricing = priceCart(cartItems, catalog);
  const cartProducts = pricing.lines.map(l => catalog.find(p => p.id === l.id));
  if (cartProducts.length === 0) {
    return res.json({ success: true, suggestion: null, reason: 'Cart items are unavailable' });
  }

  const cartValue = pricing.total;
  const cartIds = cartProducts.map(p => p.id);
  const maxPrice = maxSuggestionPrice(cartValue);
  const segment = ageSegment(customer.age);
  const candidates = catalog.filter(p => !cartIds.includes(p.id) && !excludeIds.includes(p.id) && p.stock > 0);
  const ranked = rankCrossSell(customer, cartProducts, candidates);

  // Step 1 — proposal
  let source = 'ai';
  let proposal = await ai.getSuggestion({
    customer,
    cartProducts,
    cartValue,
    maxPrice,
    segment,
    // Give the model a slightly wider set than the cap allows; the guardrail is the real enforcement
    catalog: candidates.filter(p => p.price <= maxPrice * 2),
  });

  if (!proposal && ranked.length > 0) {
    source = 'rules';
    proposal = toSuggestion(ranked[0], cartProducts);
  }

  if (!proposal) {
    return res.json({ success: true, suggestion: null, reason: 'No other products are available right now' });
  }

  // Step 2 — guardrails
  let validation = validateSuggestion(proposal, cartValue, catalog, cartIds);
  let blocked = null;

  if (!validation.valid) {
    blocked = { productName: validation.product?.name || proposal.suggestion_product_id, reason: validation.reason };
    logAudit('suggestion_blocked', {
      status: 'blocked',
      customer: customer.name,
      amount: validation.product?.price ?? null,
      reasoning: `${source === 'ai' ? 'AI' : 'Rules engine'} proposed "${blocked.productName}" — blocked: ${validation.reason}`,
      details: { proposal, cartValue, maxPrice, source },
    });

    // Step 3 — best alternative that fits the guardrails
    const fallback = ranked.find(r => r.product.price <= maxPrice);
    if (fallback) {
      proposal = toSuggestion(fallback, cartProducts);
      source = 'rules';
      validation = validateSuggestion(proposal, cartValue, catalog, cartIds);
    }
  }

  if (!validation.valid) {
    return res.json({
      success: true,
      suggestion: null,
      blocked,
      reason: `Nothing fits within the ${getConfig().maxSuggestionPricePercent}% price cap (₹${maxPrice}) for this cart`,
    });
  }

  const product = validation.product;
  const suggestion = {
    ...proposal,
    suggestion_name: product.name,
    source,
    maxPrice,
    cartValue,
  };

  logAudit('suggestion_generated', {
    status: 'success',
    customer: customer.name,
    amount: product.price,
    reasoning: suggestion.reasoning,
    details: { productId: product.id, confidence: suggestion.confidence, cartValue, maxPrice, source },
  });

  res.json({ success: true, suggestion, product, blocked });
});

function logSuggestionFeedback(action, status, verb) {
  return (req, res) => {
    const { customerId, suggestionProductId, suggestionName } = req.body;
    logAudit(action, {
      status,
      customer: customerId,
      reasoning: `Shopper ${verb} the suggestion "${suggestionName}"`,
      details: { productId: suggestionProductId },
    });
    res.json({ success: true });
  };
}

// POST /api/suggest/accept — Shopper accepted the suggestion
router.post('/accept', logSuggestionFeedback('suggestion_accepted', 'success', 'accepted'));

// POST /api/suggest/dismiss — Shopper dismissed the suggestion
router.post('/dismiss', logSuggestionFeedback('suggestion_dismissed', 'info', 'dismissed'));

module.exports = router;
