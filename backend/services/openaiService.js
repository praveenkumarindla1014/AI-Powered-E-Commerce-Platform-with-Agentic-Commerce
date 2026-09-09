/**
 * AI Service — Supports AgentRouter, DeepSeek, and OpenAI
 * Uses custom stainless/python headers for optimal compatibility and reasoning_content support
 */

function extractJson(text) {
  if (!text) return null;
  let cleaned = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
  }

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If text contains reasoning followed by JSON, find valid JSON object inside text
    const jsonMatches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
    for (let i = jsonMatches.length - 1; i >= 0; i--) {
      try {
        const candidate = JSON.parse(jsonMatches[i][0]);
        if (candidate && (candidate.suggestion_product_id !== undefined || candidate.reply !== undefined)) {
          return candidate;
        }
      } catch {}
    }

    // Try from first { to last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    throw err;
  }
}

async function callChatCompletion({ messages, model = null, temperature = 0.7, maxTokens = 2500 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  let baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (baseURL.endsWith('/')) baseURL = baseURL.slice(0, -1);
  const url = baseURL.endsWith('/chat/completions') ? baseURL : `${baseURL}/chat/completions`;

  // Custom client headers as specified for agent router & proxy compatibility
  const headers = {
    'authorization': `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'user-agent': 'Anthropic/Python 1.0.0',
    'x-stainless-lang': 'python',
    'x-stainless-os': 'MacOS',
    'x-stainless-arch': 'arm64',
    'x-stainless-runtime': 'CPython',
  };

  const selectedModel = model || process.env.AI_MODEL || (baseURL.includes('agentrouter') ? 'deepseek-v4-flash' : 'gpt-4o-mini');

  const payload = {
    model: selectedModel,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens,
  };

  console.log(`🤖 AI Request → URL: ${url} | Model: ${selectedModel}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    const errMsg = data.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errMsg);
  }

  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error('No message choices in AI response');

  // Support both standard content and DeepSeek reasoning_content (prefer finished content)
  const output = (choice.content && choice.content.trim()) ? choice.content : (choice.reasoning_content || '');
  return output.trim();
}

/**
 * Get AI-powered product suggestion
 */
async function getSuggestion({ customer, cartItem, catalog }) {
  const maxPrice = Math.round(cartItem.price * 0.3);

  // Provide eligible candidate products so the AI reasoning is fast and focused
  const candidateProducts = catalog
    .filter(p => p.id !== cartItem.id && p.stock > 0 && p.price <= maxPrice * 1.5)
    .map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      stock: p.stock,
      discount_percent: p.discount_active ? p.discount_percent : 0,
      discount_active: p.discount_active
    }));

  const systemPrompt = `You are a personalization and cross-sell agent for an online store called ShopMind.
Think briefly and respond with STRICT valid JSON only. No markdown fences, no commentary.`;

  const userPrompt = `Customer profile:
{
  "name": "${customer.name}",
  "age": ${customer.age},
  "last_purchases": ${JSON.stringify(customer.last_purchases)},
  "last_searches": ${JSON.stringify(customer.last_searches)}
}

Current cart item: ${cartItem.name} (price: ₹${cartItem.price})
30% Price Cap: ₹${maxPrice} (Suggested product price MUST be <= ₹${maxPrice})

Eligible catalog items:
${JSON.stringify(candidateProducts)}

Rules:
- Suggest exactly ONE product from Eligible catalog items with price <= ₹${maxPrice} and stock > 0
- Prefer items that match customer profile and age bracket
- If the suggested item has an active discount, include discount_percent
- If no item qualifies, return: {"suggestion_product_id": null, "suggestion_name": null, "reasoning": "No suitable product found within price constraints", "confidence": 0, "discount_percent": 0, "notify": false}

Respond ONLY in this exact JSON shape:
{
  "suggestion_product_id": "prod_xxx",
  "suggestion_name": "Product Name",
  "reasoning": "One concise sentence explaining why this product complements the cart item and matches the customer profile",
  "confidence": 0.85,
  "discount_percent": 10,
  "notify": true
}`;

  try {
    const rawText = await callChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 2500
    });

    const suggestion = extractJson(rawText);

    if (!suggestion || !suggestion.suggestion_product_id) {
      console.log('ℹ️ AI returned no suggestion (within constraints)');
      return null;
    }

    if (!suggestion.suggestion_name || !suggestion.reasoning) {
      throw new Error('Missing required fields in AI response');
    }

    console.log(`🎯 AI suggests: ${suggestion.suggestion_name} (confidence: ${suggestion.confidence})`);
    return suggestion;
  } catch (error) {
    console.error('❌ AI suggestion error:', error.message);
    return null;
  }
}

/**
 * Conversational AI Assistant chat
 */
async function chatWithAssistant({ customer, message, catalog, pastSummary }) {
  const catalogList = catalog.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    discount_active: p.discount_active,
    discount_percent: p.discount_percent
  }));

  const systemPrompt = `You are ShopMind AI, a helpful, intelligent personal shopping assistant for an online e-commerce store.
Think briefly and respond ONLY in strict JSON.
Customer context:
- Name: ${customer.name}, Age: ${customer.age}
- Past purchases: ${JSON.stringify(customer.last_purchases)}
- Typical spending range: ₹${pastSummary.minPrice} - ₹${pastSummary.maxPrice} (avg ₹${pastSummary.avgPrice})
- Age-bracket category priority: ${customer.age < 30 ? 'Electronics, Gaming & Trendy Fashion' : customer.age <= 45 ? 'Home, Ergonomics, WFH & Fitness' : 'Health, Comfort, Orthopedics & Wellness'}

Catalog: ${JSON.stringify(catalogList)}

Rules:
1. GREETINGS: If user says "hi", "hello", "hey", greet them warmly by name, ask what they're looking for, and DO NOT recommend products yet. Keep recommended_product_ids as [].
2. RECOMMENDATIONS / QUESTIONS: If user asks for suggestions, recommendations, or has questions about items/prices, give a natural helpful answer and choose 1 to 3 best matching product IDs from the catalog that match their age and budget.
3. OFFERS: Highlight any active discount in your reply.

Respond ONLY in strict JSON (no markdown, no backticks):
{
  "reply": "Your natural response here",
  "recommended_product_ids": ["prod_001"] // or [] if greeting
}`;

  try {
    const rawText = await callChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      maxTokens: 2000
    });

    return extractJson(rawText);
  } catch (error) {
    console.warn('AI chat assistant error (using smart fallback):', error.message);
    return null;
  }
}

module.exports = { callChatCompletion, getSuggestion, chatWithAssistant, extractJson };
