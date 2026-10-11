const express = require('express');
const router = express.Router();
const store = require('../services/store');
const ai = require('../services/openaiService');
const memoryService = require('../services/memory');
const { priceCart, hasDiscount, unitPrice } = require('../services/pricing');
const { ageSegment, purchaseHistory } = require('../services/profile');
const { searchCatalog } = require('../services/recommender');
const { checkEmiEligibility, checkPaymentGate } = require('../services/guardrails');
const { customerEmis } = require('../services/emi');
const { logAudit } = require('../services/auditLogger');

const INTENTS = {
  memory: /\b(what do you (?:know|remember)|remember about me|what have i told you)\b/i,
  emi: /\b(emis?|install?ments?|dues?|overdue|outstanding|pending)\b/i,
  pay: /\b(pay|payment|checkout|check out|buy now|place (?:my |the |an )?order|complete (?:my |the )?(?:order|purchase))\b/i,
  cart: /\b(my cart|in (?:my |the )?cart|cart total)\b/i,
  aboutThis: /\b(this|it|this one|this product|this item)\b/i,
  greeting: /^\s*(hi|hello|hey|hii+|namaste|good (?:morning|afternoon|evening)|yo)\b[\s!.,]*$/i,
};

const formatINR = n => `₹${Math.round(n).toLocaleString('en-IN')}`;

function toRecommendation(product, reason) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    image: product.image,
    price: product.price,
    finalPrice: unitPrice(product),
    discountPercent: hasDiscount(product) ? product.discount_percent : 0,
    reason,
  };
}

function cartSummaryText(pricing) {
  if (pricing.lines.length === 0) return 'empty';
  return `${pricing.lines.map(l => `${l.quantity}× ${l.name}`).join(', ')} (total ${formatINR(pricing.total)})`;
}

function describeProduct(product) {
  const price = unitPrice(product);
  const parts = [`${product.name} costs ${formatINR(price)}${hasDiscount(product) ? ` (${product.discount_percent}% off ${formatINR(product.price)})` : ''}.`];
  parts.push(product.description);
  parts.push(product.stock > 10 ? 'It’s in stock.' : product.stock > 0 ? `Only ${product.stock} left in stock.` : 'It’s currently out of stock.');
  if (price >= 3000) parts.push('No-cost EMI is available at checkout.');
  return parts.join(' ');
}

// GET /api/assistant/memory/:customerId — Conversation and remembered facts
router.get('/memory/:customerId', (req, res) => {
  const memory = memoryService.getMemory(req.params.customerId);
  res.json({ success: true, messages: memory.messages, facts: memory.facts, updatedAt: memory.updatedAt });
});

// POST /api/assistant/memory/:customerId/forget — Forget one fact
router.post('/memory/:customerId/forget', (req, res) => {
  const { type, value } = req.body;
  if (!['budget', 'interest', 'recipient'].includes(type)) {
    return res.status(400).json({ success: false, error: 'type must be budget, interest or recipient' });
  }
  const memory = memoryService.forget(req.params.customerId, { type, value });
  logAudit('assistant_memory_forget', {
    status: 'info',
    customer: req.params.customerId,
    reasoning: `Shopper asked the assistant to forget ${type === 'budget' ? 'their budget' : `${type} "${value}"`}`,
  });
  res.json({ success: true, facts: memory.facts });
});

// DELETE /api/assistant/memory/:customerId — Forget everything
router.delete('/memory/:customerId', (req, res) => {
  memoryService.clearMemory(req.params.customerId);
  logAudit('assistant_memory_cleared', {
    status: 'info',
    customer: req.params.customerId,
    reasoning: 'Shopper cleared the assistant’s conversation history and memory',
  });
  res.json({ success: true });
});

// POST /api/assistant/chat — Conversational shopping & payments assistant with memory
router.post('/chat', async (req, res) => {
  const { customerId, cartItems = [], currentProductId = null } = req.body;
  const message = String(req.body.message || '').trim().slice(0, 500);

  if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

  const customer = store.read('customers').find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

  const catalog = store.read('products');
  const pricing = priceCart(cartItems, catalog);
  const segment = ageSegment(customer.age);
  const currentProduct = currentProductId ? catalog.find(p => p.id === currentProductId) : null;

  // ---- Memory: recall, then learn from this message ----
  const memory = memoryService.getMemory(customer.id);
  const history = memory.messages.slice(-8).map(m => ({ role: m.role, content: m.text }));
  const probe = searchCatalog({ message, customer, catalog });
  const learned = memoryService.learn(memory, memoryService.extractFacts(message, probe.foundMatch ? probe.matchedTerms : []));
  memoryService.remember(memory, { role: 'user', text: message });

  /** Save the reply to memory and send it. Actionable cards are not persisted. */
  function respond(payload) {
    memoryService.remember(memory, {
      role: 'assistant',
      text: payload.reply,
      recommendations: payload.recommendations?.length ? payload.recommendations : undefined,
    });
    memoryService.saveMemory(customer.id, memory);
    if (learned.length > 0) {
      logAudit('assistant_memory_learned', {
        status: 'info',
        customer: customer.name,
        reasoning: `Assistant remembered ${learned.join(', ')} from "${message}"`,
      });
    }
    res.json({ success: true, learned, facts: memory.facts, ...payload });
  }

  // ---- Intent: what do you remember about me ----
  if (INTENTS.memory.test(message)) {
    const summary = memoryService.describeFacts(memory.facts);
    return respond({
      intent: 'memory',
      reply: summary === 'nothing yet'
        ? `I don't have anything saved about you yet, ${customer.name}. As we chat I'll remember things like your budget and interests — and you can delete them anytime.`
        : `Here's what I remember, ${customer.name}: ${summary}. You can remove any of it from the memory panel.`,
    });
  }

  // ---- Intent: EMI / pending dues ----
  if (INTENTS.emi.test(message)) {
    const plans = customerEmis(customer.id).filter(p => p.nextDue);

    if (plans.length === 0) {
      return respond({ intent: 'emi', reply: `Good news, ${customer.name} — you have no pending EMI installments. Everything is fully paid.` });
    }

    const plan = plans.find(p => p.hasOverdue) || plans[0];
    const due = plan.nextDue;
    const when = due.status === 'overdue' ? `was due on ${due.dueDate}` : due.status === 'due' ? 'is due today' : `is due on ${due.dueDate}`;

    logAudit('emi_inquiry', {
      status: 'info',
      customer: customer.name,
      amount: due.amount,
      reasoning: `Assistant found installment #${due.installmentNumber} of "${plan.productName}" (${formatINR(due.amount)}, ${due.status})`,
      details: { emiId: plan.id, installmentNumber: due.installmentNumber },
    });

    return respond({
      intent: 'emi',
      reply: `I found your EMI for ${plan.productName}. Installment ${due.installmentNumber} of ${plan.totalInstallments} (${formatINR(due.amount)}) ${when}. You can pay it right here with your security PIN.`,
      emi: {
        emiId: plan.id,
        productName: plan.productName,
        installmentNumber: due.installmentNumber,
        totalInstallments: plan.totalInstallments,
        amount: due.amount,
        dueDate: due.dueDate,
        status: due.status,
        outstanding: plan.outstanding,
        phone: customer.phone,
      },
    });
  }

  // ---- Intent: what's in my cart ----
  if (INTENTS.cart.test(message) && !INTENTS.pay.test(message)) {
    return respond({
      intent: 'cart',
      reply: pricing.lines.length === 0
        ? `Your cart is empty right now, ${customer.name}. Tell me what you're looking for and I'll find something.`
        : `You have ${cartSummaryText(pricing)}.${pricing.discount > 0 ? ` That includes ${formatINR(pricing.discount)} in savings.` : ''}`,
    });
  }

  // ---- Intent: pay for the cart ----
  if (INTENTS.pay.test(message)) {
    if (pricing.lines.length === 0) {
      return respond({ intent: 'pay', reply: `Your cart is empty, ${customer.name}, so there's nothing to pay for yet. Want some recommendations?` });
    }
    if (pricing.errors.length > 0) {
      return respond({ intent: 'pay', reply: `I can't check out yet: ${pricing.errors.join('; ')}.` });
    }

    const emi = checkEmiEligibility(pricing.total);
    const gate = checkPaymentGate(pricing.total);

    logAudit('agent_payment_prepared', {
      status: 'info',
      customer: customer.name,
      amount: pricing.total,
      reasoning: `Assistant prepared checkout for ${formatINR(pricing.total)} (${pricing.lines.length} item${pricing.lines.length === 1 ? '' : 's'}). Requires PIN approval from the shopper.`,
      details: { gate, emiEligible: emi.eligible },
    });

    return respond({
      intent: 'pay',
      reply: `Your cart comes to ${formatINR(pricing.total)}. I can charge your saved UPI (${customer.upi_id}) once you approve with your security PIN — nothing is charged without it.`,
      payment: {
        amount: pricing.total,
        itemCount: pricing.lines.reduce((s, l) => s + l.quantity, 0),
        upiId: customer.upi_id,
        phone: customer.phone,
        gated: !gate.autoApprove,
        emi: emi.eligible ? { months: emi.months, emiAmount: emi.emiAmount } : null,
      },
    });
  }

  // ---- AI conversation (with memory and the product on screen) ----
  const aiResponse = await ai.chatWithAssistant({
    customer,
    message,
    history, // recalled before this message was added
    catalog,
    pastSummary: purchaseHistory(customer, catalog),
    segment,
    cartSummary: cartSummaryText(pricing),
    memorySummary: memoryService.describeFacts(memory.facts),
    currentProduct,
  });

  if (aiResponse) {
    const recommendations = aiResponse.recommended_product_ids
      .map(id => catalog.find(p => p.id === id && p.stock > 0))
      .filter(Boolean)
      .slice(0, 3)
      .map(p => toRecommendation(p, hasDiscount(p) ? `${p.discount_percent}% off right now` : null));

    logAudit('assistant_query', {
      status: 'success',
      customer: customer.name,
      reasoning: `"${message}" → AI replied with ${recommendations.length} recommendation(s)`,
      details: { source: 'ai', recommendations: recommendations.map(r => r.id), memory: memory.facts },
    });

    return respond({ intent: 'chat', source: 'ai', reply: aiResponse.reply, recommendations });
  }

  // ---- Rules-based fallback ----
  if (INTENTS.greeting.test(message)) {
    const returning = memory.messages.length > 2;
    const interest = memory.facts.interests[0];
    return respond({
      intent: 'chat',
      source: 'rules',
      reply: returning
        ? `Welcome back, ${customer.name}!${interest ? ` Still looking at ${interest}?` : ''} Tell me what you need today.`
        : `Hi ${customer.name}! What are you shopping for today? You can tell me a product, a budget ("under ₹2,000"), or ask about offers.`,
      recommendations: [],
    });
  }

  // Questions about the product on screen ("is this good for running?")
  if (currentProduct && INTENTS.aboutThis.test(message) && !probe.foundMatch) {
    return respond({ intent: 'chat', source: 'rules', reply: describeProduct(currentProduct), recommendations: [] });
  }

  const result = searchCatalog({
    message,
    customer,
    catalog,
    fallbackBudget: memory.facts.budget,
    boostTerms: memory.facts.interests,
  });
  const budgetText = result.budget ? ` under ${formatINR(result.budget)}${result.budgetFromMemory ? ' (your usual budget)' : ''}` : '';

  let reply;
  if (result.items.length === 0) {
    reply = result.budget
      ? `I couldn't find anything in stock${budgetText}${result.wantsDeals ? ' with an active offer' : ''}. Try a slightly higher budget?`
      : `I couldn't find a match for that. Could you describe it differently?`;
  } else if (result.foundMatch) {
    reply = `Here's what I found${budgetText}${result.wantsDeals ? ' with active offers' : ''}:`;
  } else if (result.searchedTerms.length > 0 && !result.wantsDeals && !extractedBudgetOnly(message)) {
    reply = `We don't carry "${result.searchedTerms.join(' ')}" right now, but these are popular with shoppers like you:`;
  } else if (result.wantsDeals) {
    reply = `These offers are live right now${budgetText}:`;
  } else {
    const interests = memory.facts.interests.slice(0, 2);
    reply = `Here are my picks for you${budgetText}, based on ${interests.length ? `your interest in ${interests.join(' and ')}` : `your profile (${segment.label})`}:`;
  }

  const recommendations = result.items.map(p => toRecommendation(
    p,
    hasDiscount(p) ? `${p.discount_percent}% off right now` : segment.categories.includes(p.category) ? `Popular in ${p.category}` : null,
  ));

  logAudit('assistant_query', {
    status: 'success',
    customer: customer.name,
    reasoning: `"${message}" → rules engine returned ${recommendations.length} item(s)${budgetText}`,
    details: { source: 'rules', recommendations: recommendations.map(r => r.id), memory: memory.facts },
  });

  respond({ intent: 'chat', source: 'rules', reply, recommendations });
});

/** True when the message is only about a budget ("anything under 2k?") */
function extractedBudgetOnly(message) {
  return /\b(under|below|within|budget|less than|upto|up to)\b/i.test(message);
}

module.exports = router;
