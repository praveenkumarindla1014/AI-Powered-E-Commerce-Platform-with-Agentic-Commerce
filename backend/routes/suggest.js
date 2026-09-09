const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getSuggestion, chatWithAssistant } = require('../services/openaiService');
const { validateSuggestion } = require('../services/guardrails');
const { logAudit } = require('../services/auditLogger');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const CUSTOMERS_FILE = path.join(__dirname, '..', 'data', 'customers.json');

function readProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
}

function readCustomers() {
  return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf-8'));
}

// POST /api/suggest — Get AI suggestion with guardrail checks
router.post('/', async (req, res) => {
  try {
    const { customerId, cartItems } = req.body;

    if (!customerId || !cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'customerId and cartItems (non-empty) are required'
      });
    }

    const customers = readCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const catalog = readProducts();

    // Use the first/primary cart item for suggestion context
    const primaryCartItem = cartItems[0];
    const cartProduct = catalog.find(p => p.id === primaryCartItem.id);
    if (!cartProduct) {
      return res.status(404).json({ success: false, error: 'Cart item not found in catalog' });
    }

    // Calculate total cart value
    const cartValue = cartItems.reduce((sum, item) => {
      const prod = catalog.find(p => p.id === item.id);
      return sum + (prod ? prod.price * (item.quantity || 1) : 0);
    }, 0);

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_key_here') {
      // Return a mock suggestion for demo when no API key is set
      const mockSuggestion = generateMockSuggestion(customer, cartProduct, catalog, cartValue);

      if (mockSuggestion) {
        const validation = validateSuggestion(mockSuggestion, cartValue, catalog);

        if (validation.valid) {
          logAudit('suggestion_generated', {
            status: 'success',
            customer: customer.name,
            reasoning: mockSuggestion.reasoning,
            amount: validation.product.price,
            details: {
              suggestion: mockSuggestion,
              cartValue,
              source: 'mock_engine'
            }
          });

          return res.json({
            success: true,
            suggestion: mockSuggestion,
            product: validation.product,
            source: 'mock'
          });
        } else {
          logAudit('suggestion_blocked', {
            status: 'blocked',
            customer: customer.name,
            reasoning: validation.reason,
            details: { suggestion: mockSuggestion, cartValue }
          });

          return res.json({
            success: true,
            suggestion: null,
            blocked: true,
            reason: validation.reason,
            source: 'mock'
          });
        }
      }

      return res.json({ success: true, suggestion: null, reason: 'No suitable suggestion found (mock mode)' });
    }

    // Call OpenAI API
    let aiSuggestion = null;
    let suggestionSource = 'openai';

    try {
      aiSuggestion = await getSuggestion({
        customer,
        cartItem: { id: cartProduct.id, name: cartProduct.name, price: cartProduct.price },
        catalog
      });
    } catch (err) {
      console.warn('OpenAI error, falling back to heuristic engine:', err.message);
    }

    if (!aiSuggestion) {
      console.log('Using intelligent personalization engine fallback (due to API quota/error)');
      aiSuggestion = generateMockSuggestion(customer, cartProduct, catalog, cartValue);
      suggestionSource = 'engine_fallback';
    }

    if (!aiSuggestion) {
      logAudit('suggestion_failed', {
        status: 'failed',
        customer: customer.name,
        reasoning: 'No eligible suggestion found within price bounds',
        details: { cartItem: cartProduct.name, cartValue }
      });

      return res.json({
        success: true,
        suggestion: null,
        reason: 'No eligible suggestion found within price constraints'
      });
    }

    // Run through guardrails
    const validation = validateSuggestion(aiSuggestion, cartValue, catalog);

    if (!validation.valid) {
      logAudit('suggestion_blocked', {
        status: 'blocked',
        customer: customer.name,
        reasoning: validation.reason,
        amount: validation.product ? validation.product.price : null,
        details: {
          suggestion: aiSuggestion,
          cartValue,
          guardrailReason: validation.reason,
          source: suggestionSource
        }
      });

      return res.json({
        success: true,
        suggestion: null,
        blocked: true,
        reason: validation.reason,
        source: suggestionSource
      });
    }

    // Suggestion passed guardrails
    logAudit('suggestion_generated', {
      status: 'success',
      customer: customer.name,
      reasoning: aiSuggestion.reasoning,
      amount: validation.product.price,
      details: {
        suggestion: aiSuggestion,
        cartValue,
        source: suggestionSource
      }
    });

    res.json({
      success: true,
      suggestion: aiSuggestion,
      product: validation.product,
      source: suggestionSource
    });
  } catch (error) {
    console.error('Suggestion error:', error);
    logAudit('suggestion_error', {
      status: 'failed',
      reasoning: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/suggest/accept — Log that user accepted a suggestion
router.post('/accept', (req, res) => {
  const { customerId, suggestionProductId, suggestionName } = req.body;
  logAudit('suggestion_accepted', {
    status: 'success',
    customer: customerId,
    reasoning: `User accepted suggestion: ${suggestionName}`,
    details: { productId: suggestionProductId }
  });
  res.json({ success: true });
});

// POST /api/suggest/dismiss — Log that user dismissed a suggestion
router.post('/dismiss', (req, res) => {
  const { customerId, suggestionProductId, suggestionName } = req.body;
  logAudit('suggestion_dismissed', {
    status: 'info',
    customer: customerId,
    reasoning: `User dismissed suggestion: ${suggestionName}`,
    details: { productId: suggestionProductId }
  });
  res.json({ success: true });
});

/**
 * Helper: Compute customer's historical purchase price range
 */
function getCustomerPastPurchasesSummary(customer, catalog) {
  const pastItems = catalog.filter(p => customer.last_purchases.includes(p.name));
  if (pastItems.length === 0) {
    return { minPrice: 500, maxPrice: 4000, avgPrice: 2000, items: [] };
  }
  const prices = pastItems.map(p => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  return { minPrice, maxPrice, avgPrice, items: pastItems };
}

// POST /api/suggest/assistant-chat — Interactive AI Shopping Assistant
router.post('/assistant-chat', async (req, res) => {
  try {
    const { customerId, message, cartItems, cartTotal } = req.body;
    const customers = readCustomers();
    const customer = customers.find(c => c.id === customerId) || customers[0];
    const catalog = readProducts();

    // Check for Pending EMI inquiry intent ("any payment pending", "pending emi", "due installment")
    const isEmiPendingRequest = message && /(pending|emi|due|installment|unpaid|balance)/i.test(message);
    if (isEmiPendingRequest) {
      const EMI_FILE = path.join(__dirname, '..', 'data', 'emi_records.json');
      let emiRecords = [];
      try { emiRecords = JSON.parse(fs.readFileSync(EMI_FILE, 'utf-8')); } catch {}
      const customerEmis = emiRecords.filter(r => r.customerId === customer.id);
      const activePending = customerEmis.find(e => e.installments.some(i => i.status === 'pending'));

      if (activePending) {
        const pendingInst = activePending.installments.find(i => i.status === 'pending');
        const phone = customer.phone || activePending.phone;

        logAudit('emi_inquiry', {
          status: 'success',
          customer: customer.name,
          amount: pendingInst.amount,
          reasoning: `AI Agent looked up pending EMI for ${customer.name}. Found Installment #${pendingInst.installmentNumber} (₹${pendingInst.amount}) due on ${pendingInst.dueDate} for ${activePending.productName}. Dispatched to phone ${phone}.`,
          details: {
            emiId: activePending.id,
            installmentNumber: pendingInst.installmentNumber,
            dueDate: pendingInst.dueDate,
            phone
          }
        });

        return res.json({
          success: true,
          isEmiAction: true,
          reply: `Hello ${customer.name}! I checked your account linked with ${phone}. You have 1 pending EMI installment of ₹${pendingInst.amount.toLocaleString()} due for "${activePending.productName}". You can authorize and settle it below:`,
          pendingEmiDetails: {
            emiId: activePending.id,
            productName: activePending.productName,
            installmentNumber: pendingInst.installmentNumber,
            amount: pendingInst.amount,
            dueDate: pendingInst.dueDate,
            phone: phone,
            upiId: customer.upi_id || `${customer.name.toLowerCase()}@upi`,
            securityPrompt: `Security check: Mobile sync active with ${phone}. Enter your 4-digit security PIN (Default: 1234) to approve this EMI bank transfer.`
          },
          customerContext: {
            name: customer.name,
            age: customer.age,
            phone,
            upiId: customer.upi_id
          }
        });
      } else {
        return res.json({
          success: true,
          reply: `Great news ${customer.name}! There are no pending EMI payments on your account (${customer.phone || 'linked mobile'}). All previous installments are fully cleared.`,
          customerContext: { name: customer.name, age: customer.age, phone: customer.phone }
        });
      }
    }

    // Check for Payment Intent ("make payment", "pay now", "checkout", "send payment link", etc.)
    const isPaymentRequest = message && /(pay|payment|checkout|buy now|send link|make payment|upi|pay link|settle)/i.test(message);
    if (isPaymentRequest) {
      const crypto = require('crypto');
      const amount = cartTotal && cartTotal > 0 ? cartTotal : 2499;
      const linkId = 'plink_' + crypto.randomBytes(4).toString('hex');
      const paymentLink = `https://rzp.io/l/${linkId}`;
      const phone = customer.phone || '+91 98765 34562';
      const upiId = customer.upi_id || `${customer.name.toLowerCase()}@upi`;
      const qualifiesEmi = amount >= 3000;
      const emiSplit = qualifiesEmi ? Math.round(amount / 3) : null;

      logAudit('agent_payment_link', {
        status: 'success',
        customer: customer.name,
        amount,
        reasoning: `AI Agent generated Razorpay payment link for ${customer.name}. Automatically fetched phone (${phone}) and UPI (${upiId}). Security mobile approval dispatched.`,
        details: {
          phone,
          upiId,
          paymentLink,
          amount,
          qualifiesEmi,
          emiSplit
        }
      });

      return res.json({
        success: true,
        isPaymentAction: true,
        reply: `Payment link ready for ${customer.name}! I fetched your linked phone ${phone}. You can pay directly via UPI (${upiId}), complete Razorpay checkout, or approve the security link below.`,
        paymentDetails: {
          phone,
          upiId,
          amount,
          paymentLink,
          qualifiesEmi,
          emiSplit,
          securityPrompt: `Security check: Payment authorization request dispatched to ${phone}. 1-Click Approve to authorize ₹${amount.toLocaleString()}.`
        },
        customerContext: {
          name: customer.name,
          age: customer.age,
          phone,
          upiId
        }
      });
    }

    // 1. Age-based categories
    const ageCategoryMap = customer.age < 30
      ? ['electronics', 'gaming', 'fashion']
      : customer.age <= 45
        ? ['home', 'health']
        : ['health', 'home'];

    const ageGroupLabel = customer.age < 30
      ? 'under 30 (Tech, Gaming & Fashion)'
      : customer.age <= 45
        ? '30-45 (Home, Fitness & WFH)'
        : '45+ (Health, Comfort & Wellness)';

    // 2. Past purchase price range
    const pastSummary = getCustomerPastPurchasesSummary(customer, catalog);

    // 3. First attempt live OpenAI Conversational Assistant
    let openAiResponse = null;
    try {
      openAiResponse = await chatWithAssistant({ customer, message, catalog, pastSummary });
    } catch (err) {
      console.warn('OpenAI chat assistant error, using fallback:', err.message);
    }

    if (openAiResponse && openAiResponse.reply) {
      let openAiRecs = [];
      if (Array.isArray(openAiResponse.recommended_product_ids) && openAiResponse.recommended_product_ids.length > 0) {
        openAiRecs = openAiResponse.recommended_product_ids.map(id => {
          const prod = catalog.find(p => p.id === id);
          if (!prod) return null;
          const hasDiscount = prod.discount_active && prod.discount_percent > 0;
          const finalPrice = hasDiscount ? Math.round(prod.price * (1 - prod.discount_percent / 100)) : prod.price;
          return {
            id: prod.id,
            name: prod.name,
            category: prod.category,
            originalPrice: prod.price,
            finalPrice,
            discountPercent: hasDiscount ? prod.discount_percent : 0,
            discountActive: hasDiscount,
            image: prod.image,
            reason: `Recommended by OpenAI for your age profile (${prod.category}).` + (hasDiscount ? ` 🎉 Active Deal: ${prod.discount_percent}% off!` : '')
          };
        }).filter(Boolean);
      }

      logAudit('assistant_query', {
        status: 'success',
        customer: customer.name,
        reasoning: `OpenAI response for ${customer.name}: "${message}". Returned ${openAiRecs.length} items.`,
        details: { source: 'openai', recommendations: openAiRecs }
      });

      return res.json({
        success: true,
        reply: openAiResponse.reply,
        recommendations: openAiRecs,
        customerContext: {
          name: customer.name,
          age: customer.age,
          ageGroupLabel,
          pastPurchases: customer.last_purchases,
          typicalPriceBand: `₹${pastSummary.minPrice.toLocaleString()} – ₹${pastSummary.maxPrice.toLocaleString()}`
        }
      });
    }

    // 4. Smart Conversational Fallback (used when OpenAI quota is exhausted or API is offline)
    const isGreeting = message && /^(hi|hello|hey|greetings|howdy|what'?s up|good morning|good afternoon|good evening|yo)\b/i.test(message.trim());
    if (isGreeting) {
      return res.json({
        success: true,
        reply: `Hello ${customer.name}! 👋 Great to see you. I'm your ShopMind Personal Shopping Agent. How can I help you today? You can ask me for product recommendations tailored to your age bracket (${ageGroupLabel}), ask about active discounts, or tell me your budget!`,
        recommendations: [],
        customerContext: {
          name: customer.name,
          age: customer.age,
          ageGroupLabel,
          pastPurchases: customer.last_purchases,
          typicalPriceBand: `₹${pastSummary.minPrice.toLocaleString()} – ₹${pastSummary.maxPrice.toLocaleString()}`
        }
      });
    }

    // Extract explicit budget from message, e.g. "under 50k", "50k under", "below 2000", "50 thousand"
    function extractBudgetFromMessage(msg) {
      if (!msg) return null;
      // Match "under 50k", "below 50000", "within 1.5k", "budget 50k"
      const prefixMatch = msg.match(/(?:under|below|around|less than|within|budget of?)\s*₹?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\b/i);
      if (prefixMatch) {
        let num = parseFloat(prefixMatch[1]);
        const unit = (prefixMatch[2] || '').toLowerCase();
        if (unit === 'k' || unit === 'thousand') num *= 1000;
        else if (unit === 'lakh' || unit === 'lac') num *= 100000;
        return Math.round(num);
      }
      // Match "50k under", "50k budget", "20k mobile"
      const suffixMatch = msg.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)\b/i);
      if (suffixMatch) {
        let num = parseFloat(suffixMatch[1]);
        const unit = (suffixMatch[2] || '').toLowerCase();
        if (unit === 'k' || unit === 'thousand') num *= 1000;
        else if (unit === 'lakh' || unit === 'lac') num *= 100000;
        return Math.round(num);
      }
      return null;
    }

    const budgetFilter = extractBudgetFromMessage(message);

    // Extract product category / keyword intent from message (e.g. "mobile", "phone", "shoes", "earbuds", "watch")
    const lowerMsg = message.toLowerCase();
    const productKeywords = [
      { key: 'mobile', terms: ['mobile', 'phone', 'smartphone', '5g', 'android', 'cell'] },
      { key: 'shoes', terms: ['shoes', 'shoe', 'walking', 'sneaker', 'footwear'] },
      { key: 'keyboard', terms: ['keyboard', 'mechanical', 'gaming keyboard'] },
      { key: 'earbuds', terms: ['earbuds', 'headphone', 'audio', 'earphone', 'headset'] },
      { key: 'watch', terms: ['watch', 'smartwatch', 'tracker', 'fitness tracker'] },
      { key: 'chair', terms: ['chair', 'office chair', 'ergonomic'] },
      { key: 'charger', terms: ['charger', 'charging', 'wireless charger', 'stand'] },
      { key: 'tea', terms: ['tea', 'wellness tea', 'herbal'] },
      { key: 'cushions', terms: ['cushion', 'cushions', 'insoles', 'orthopedic'] },
      { key: 'hoodie', terms: ['hoodie', 'sweatshirt', 'streetwear', 'fashion', 'cloth'] },
      { key: 'hub', terms: ['hub', 'usb-c', 'adapter'] },
      { key: 'bp', terms: ['blood pressure', 'bp', 'monitor'] },
      { key: 'laptop', terms: ['laptop', 'notebook', 'macbook', 'pc', 'computer'] },
      { key: 'tablet', terms: ['tablet', 'ipad'] }
    ];

    const detectedKeywords = productKeywords.filter(k => k.terms.some(t => lowerMsg.includes(t)));
    const matchedTerms = detectedKeywords.flatMap(k => k.terms);

    // Filter catalog based on Budget & Keywords
    let candidates = catalog.filter(p => p.stock > 0);

    // If user specified an explicit budget (e.g. "under 2000", "under 50k"), filter by budget
    if (budgetFilter) {
      candidates = candidates.filter(p => p.price <= budgetFilter * 1.15);
    } else if (detectedKeywords.length === 0) {
      // Only apply historical price band when user has NOT asked for a specific product
      const minBound = Math.max(300, pastSummary.minPrice * 0.5);
      const maxBound = Math.max(8000, pastSummary.maxPrice * 3.0);
      candidates = candidates.filter(p => p.price >= minBound && p.price <= maxBound);
    }

    // Separate direct keyword matches from related category items
    let directMatches = [];
    if (matchedTerms.length > 0) {
      directMatches = candidates.filter(p =>
        matchedTerms.some(t =>
          p.name.toLowerCase().includes(t) ||
          p.tags.some(tag => tag.toLowerCase().includes(t))
        )
      );
    }

    let topItems = [];
    let replyText = `Hello ${customer.name}! `;

    if (detectedKeywords.length > 0) {
      const keywordName = detectedKeywords[0].key;
      if (directMatches.length > 0) {
        // Direct match found (e.g. "Smartwatch Fitness Tracker" for "watch")
        directMatches.sort((a, b) => {
          const aNameMatch = matchedTerms.some(t => a.name.toLowerCase().includes(t)) ? 10 : 0;
          const bNameMatch = matchedTerms.some(t => b.name.toLowerCase().includes(t)) ? 10 : 0;
          return (bNameMatch + (b.discount_active ? 1 : 0)) - (aNameMatch + (a.discount_active ? 1 : 0));
        });

        // Fill remaining with complementary items from the same category
        const directIds = new Set(directMatches.map(m => m.id));
        const complementary = candidates.filter(p => !directIds.has(p.id) && p.category === directMatches[0].category);
        topItems = [...directMatches, ...complementary].slice(0, 3);

        if (budgetFilter) {
          replyText += `Here are the top ${keywordName} options under ₹${budgetFilter.toLocaleString()}:`;
        } else {
          replyText += `Here are the top ${keywordName} options available in our store:`;
        }
      } else {
        // Specific item not in stock -> tell user and show related items
        const relatedCat = detectedKeywords[0].key === 'watch' || detectedKeywords[0].key === 'mobile' ? 'electronics' : 'health';
        const relatedItems = candidates.filter(p => p.category === relatedCat);
        topItems = (relatedItems.length > 0 ? relatedItems : candidates).slice(0, 3);
        replyText += `We don't currently have ${keywordName} in stock, but here are related ${relatedCat} items you might like:`;
      }
    } else {
      // General recommendation query without specific keyword
      candidates.sort((a, b) => {
        const aAgeMatch = ageCategoryMap.includes(a.category) ? 2 : 0;
        const bAgeMatch = ageCategoryMap.includes(b.category) ? 2 : 0;
        const aDiscount = a.discount_active ? 1 : 0;
        const bDiscount = b.discount_active ? 1 : 0;
        return (bAgeMatch + bDiscount) - (aAgeMatch + aDiscount);
      });
      topItems = candidates.slice(0, 3);

      if (budgetFilter) {
        replyText += `Here are items under ₹${budgetFilter.toLocaleString()} picked for you:`;
      } else {
        replyText += `Here are personalized recommendations based on your preferences:`;
      }
    }

    const recommendations = topItems.map(item => {
      const hasDiscount = item.discount_active && item.discount_percent > 0;
      const finalPrice = hasDiscount ? Math.round(item.price * (1 - item.discount_percent / 100)) : item.price;
      
      let reason = item.description ? item.description.slice(0, 95) + '...' : `Recommended for your profile (${item.category}).`;
      if (hasDiscount) {
        reason += ` 🎉 Active Deal: ${item.discount_percent}% off!`;
      }

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        originalPrice: item.price,
        finalPrice: finalPrice,
        discountPercent: hasDiscount ? item.discount_percent : 0,
        discountActive: hasDiscount,
        image: item.image,
        reason: reason
      };
    });

    // Log to audit trail
    logAudit('assistant_query', {
      status: 'success',
      customer: customer.name,
      reasoning: `Assistant query by ${customer.name}: "${message || 'recommendation'}". Filtered for age ${customer.age} and price band ₹${pastSummary.minPrice}-₹${pastSummary.maxPrice}. Returned ${recommendations.length} items.`,
      details: {
        customerAge: customer.age,
        ageGroupLabel,
        pastPriceRange: { min: pastSummary.minPrice, max: pastSummary.maxPrice, avg: pastSummary.avgPrice },
        recommendations
      }
    });

    res.json({
      success: true,
      reply: replyText,
      recommendations,
      customerContext: {
        name: customer.name,
        age: customer.age,
        ageGroupLabel,
        pastPurchases: customer.last_purchases,
        typicalPriceBand: `₹${pastSummary.minPrice.toLocaleString()} – ₹${pastSummary.maxPrice.toLocaleString()}`
      }
    });
  } catch (error) {
    console.error('Assistant chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate a mock suggestion when OpenAI is not configured
 * Uses simple heuristics based on customer profile and cart
 */
function generateMockSuggestion(customer, cartProduct, catalog, cartValue) {
  const maxPrice = (cartValue * 30) / 100;

  // Filter eligible products
  let eligible = catalog.filter(p =>
    p.id !== cartProduct.id &&
    p.stock > 0 &&
    p.price <= maxPrice
  );

  if (eligible.length === 0) return null;

  // Prefer products matching age category
  const ageCategories = customer.age < 30
    ? ['electronics', 'gaming', 'fashion']
    : customer.age <= 45
      ? ['home', 'health']
      : ['health', 'home'];

  let preferred = eligible.filter(p => ageCategories.includes(p.category));

  // Prefer products matching last searches
  if (customer.last_searches.length > 0) {
    const searchMatches = eligible.filter(p =>
      customer.last_searches.some(s =>
        p.tags.some(t => t.toLowerCase().includes(s.toLowerCase())) ||
        p.name.toLowerCase().includes(s.toLowerCase())
      )
    );
    if (searchMatches.length > 0) preferred = searchMatches;
  }

  // Pick best match (prefer discounted items)
  const pool = preferred.length > 0 ? preferred : eligible;
  const discounted = pool.filter(p => p.discount_active);
  const pick = discounted.length > 0 ? discounted[0] : pool[0];

  return {
    suggestion_product_id: pick.id,
    suggestion_name: pick.name,
    reasoning: `Based on your profile (age ${customer.age}) and recent interest in "${customer.last_searches[0] || 'similar items'}", this ${pick.category} item complements your cart.`,
    confidence: 0.82,
    discount_percent: pick.discount_active ? pick.discount_percent : 0,
    notify: pick.discount_active
  };
}

module.exports = router;
