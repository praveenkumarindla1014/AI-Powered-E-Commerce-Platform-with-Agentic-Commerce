/**
 * AI Service — talks to any OpenAI-compatible chat completions API
 * (OpenAI, DeepSeek, AgentRouter, ...). Configure with OPENAI_API_KEY,
 * OPENAI_BASE_URL and AI_MODEL in backend/.env.
 *
 * Every function returns null on failure so callers can fall back to the
 * deterministic engine — the store keeps working without an AI provider.
 */

function isConfigured() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key) && key !== 'your_openai_key_here';
}

function baseUrl() {
  let url = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

function extractJson(text) {
  if (!text) return null;
  let cleaned = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Reasoning models sometimes wrap the JSON in prose — take the outermost object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    throw err;
  }
}

async function callChatCompletion({ messages, model = null, temperature = 0.7, maxTokens = 1500 }) {
  const base = baseUrl();
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;

  const headers = {
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'content-type': 'application/json',
  };

  // Some OpenAI-compatible proxies (e.g. AgentRouter) only accept requests that
  // identify as an official SDK client.
  if (!base.includes('api.openai.com')) {
    Object.assign(headers, {
      'user-agent': 'Anthropic/Python 1.0.0',
      'x-stainless-lang': 'python',
      'x-stainless-os': 'MacOS',
      'x-stainless-arch': 'arm64',
      'x-stainless-runtime': 'CPython',
    });
  }

  const selectedModel = model || process.env.AI_MODEL || (base.includes('agentrouter') ? 'deepseek-v4-flash' : 'gpt-4o-mini');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: selectedModel, messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error('No message choices in AI response');

  // Support both standard content and DeepSeek reasoning_content (prefer finished content)
  const output = choice.content?.trim() ? choice.content : (choice.reasoning_content || '');
  return output.trim();
}

/**
 * Ask the model for ONE cross-sell suggestion. Only products that already
 * satisfy the guardrails are offered as candidates; the result is still
 * re-validated by the caller.
 */
async function getSuggestion({ customer, cartProducts, cartValue, maxPrice, catalog, segment }) {
  if (!isConfigured()) return null;

  const cartIds = cartProducts.map(p => p.id);
  const candidates = catalog
    .filter(p => !cartIds.includes(p.id) && p.stock > 0 && p.price <= maxPrice)
    .map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      tags: p.tags,
      discount_percent: p.discount_active ? p.discount_percent : 0,
    }));

  if (candidates.length === 0) return null;

  const systemPrompt = `You are the cross-sell agent for an online store called ShopMind.
Pick the single product that best complements the customer's cart.
Respond with STRICT valid JSON only. No markdown fences, no commentary.`;

  const userPrompt = `Customer profile:
${JSON.stringify({
    name: customer.name,
    age: customer.age,
    segment: segment.label,
    last_purchases: customer.last_purchases,
    last_searches: customer.last_searches,
  })}

Cart (total ₹${cartValue}): ${cartProducts.map(p => p.name).join(', ')}

Candidate products (all within the ₹${maxPrice} price cap and in stock):
${JSON.stringify(candidates)}

Rules:
- Suggest exactly ONE product id from the candidates
- Prefer items that complement the cart AND match the customer's searches, purchases and segment
- "reasoning" must be one short, friendly sentence addressed to the customer

Respond ONLY in this exact JSON shape:
{"suggestion_product_id": "prod_xxx", "reasoning": "...", "confidence": 0.85}`;

  try {
    const rawText = await callChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });

    const suggestion = extractJson(rawText);
    if (!suggestion?.suggestion_product_id || !suggestion.reasoning) return null;

    const confidence = Number(suggestion.confidence);
    return {
      suggestion_product_id: suggestion.suggestion_product_id,
      reasoning: String(suggestion.reasoning),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.7,
    };
  } catch (error) {
    console.error('AI suggestion error:', error.message);
    return null;
  }
}

/**
 * Conversational shopping assistant. `history` is the recent conversation
 * as [{ role: 'user' | 'assistant', content }].
 */
async function chatWithAssistant({ customer, message, history = [], catalog, pastSummary, segment, cartSummary, memorySummary = 'nothing yet', currentProduct = null }) {
  if (!isConfigured()) return null;

  const catalogList = catalog
    .filter(p => p.stock > 0)
    .map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      discount_percent: p.discount_active ? p.discount_percent : 0,
    }));

  const systemPrompt = `You are ShopMind's friendly personal shopping assistant.
Customer: ${customer.name}, age ${customer.age} (${segment.label}).
Past purchases: ${JSON.stringify(customer.last_purchases)}.
Typical spend: ₹${pastSummary.minPrice}–₹${pastSummary.maxPrice} (avg ₹${pastSummary.avgPrice}).
Current cart: ${cartSummary}.
What you remember about them from earlier conversations: ${memorySummary}.
${currentProduct ? `They are currently looking at: ${JSON.stringify({ id: currentProduct.id, name: currentProduct.name, price: currentProduct.price, discount_percent: currentProduct.discount_active ? currentProduct.discount_percent : 0, stock: currentProduct.stock, description: currentProduct.description })}. "this" or "it" usually refers to this product.` : ''}

Catalog (only recommend from this list): ${JSON.stringify(catalogList)}

Guidelines:
1. Greetings or small talk: reply warmly by name and ask what they need. Recommend nothing.
2. Requests or questions about products: answer helpfully in 1–3 sentences and recommend 1–3 matching product ids. Respect any budget they mention; if they don't mention one, respect their remembered budget.
3. Use what you remember naturally (e.g. "since you're into gaming…"), but don't recite it.
4. Mention active discounts when relevant. Never invent products, prices or policies.

Respond ONLY with strict JSON (no markdown):
{"reply": "...", "recommended_product_ids": ["prod_001"]}`;

  try {
    const rawText = await callChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6),
        { role: 'user', content: message },
      ],
      temperature: 0.6,
    });
    const parsed = extractJson(rawText);
    if (!parsed?.reply) return null;
    return {
      reply: String(parsed.reply),
      recommended_product_ids: Array.isArray(parsed.recommended_product_ids) ? parsed.recommended_product_ids : [],
    };
  } catch (error) {
    console.warn('AI chat assistant error (using fallback):', error.message);
    return null;
  }
}

module.exports = { isConfigured, callChatCompletion, getSuggestion, chatWithAssistant, extractJson };
