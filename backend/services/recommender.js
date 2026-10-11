/**
 * Recommender — deterministic ranking used when no AI provider is configured
 * (or the provider fails). Every score is explainable: the reasons that
 * contributed to it are returned alongside the product.
 */
const { ageSegment } = require('./profile');
const { hasDiscount, unitPrice } = require('./pricing');

const lower = s => String(s || '').toLowerCase();

function matchesTerm(product, term) {
  const t = lower(term);
  return lower(product.name).includes(t) || (product.tags || []).some(tag => lower(tag).includes(t) || t.includes(lower(tag)));
}

/**
 * Rank cross-sell candidates for a cart.
 * @returns {Array<{ product, score, reasons }>} best first
 */
function rankCrossSell(customer, cartProducts, candidates) {
  const segment = ageSegment(customer.age);
  const cartTags = new Set(cartProducts.flatMap(p => (p.tags || []).map(lower)));
  const cartCategories = new Set(cartProducts.map(p => p.category));

  return candidates
    .map(product => {
      let score = 0;
      const reasons = [];

      const search = customer.last_searches.find(s => matchesTerm(product, s));
      if (search) {
        score += 3;
        reasons.push(`you recently searched for "${search}"`);
      }

      const sharedTag = (product.tags || []).find(t => cartTags.has(lower(t)));
      if (sharedTag) {
        score += 2;
        reasons.push(`it pairs with the ${sharedTag} gear in your cart`);
      } else if (cartCategories.has(product.category)) {
        score += 1;
        reasons.push(`it complements your ${product.category} picks`);
      }

      if (segment.categories.includes(product.category)) {
        score += 1.5;
        reasons.push(`${product.category} is popular with shoppers like you`);
      }

      if (hasDiscount(product)) {
        score += 1;
        reasons.push(`it's ${product.discount_percent}% off right now`);
      }

      return { product, score, reasons };
    })
    .sort((a, b) => b.score - a.score || unitPrice(a.product) - unitPrice(b.product));
}

/** Turn a ranked entry into the suggestion shape used by the API. */
function toSuggestion(entry, cartProducts) {
  const { product, score, reasons } = entry;
  const anchor = cartProducts[0]?.name || 'your cart';
  const why = reasons.length > 0
    ? reasons.slice(0, 2).join(' and ')
    : `it's a well-rated add-on for ${anchor}`;

  return {
    suggestion_product_id: product.id,
    reasoning: `We picked ${product.name} because ${why}.`,
    confidence: Math.min(0.95, 0.55 + score * 0.06),
  };
}

// Common shopper words → catalog vocabulary
const SYNONYMS = {
  phone: ['mobile', 'smartphone'],
  mobile: ['smartphone', 'phone'],
  headphones: ['earbuds', 'audio'],
  headphone: ['earbuds', 'audio'],
  earphones: ['earbuds', 'audio'],
  music: ['audio', 'earbuds'],
  laptop: ['usb-c', 'hub'],
  shoes: ['shoes', 'sneakers', 'walking'],
  shoe: ['shoes', 'sneakers'],
  clothes: ['fashion', 'hoodie'],
  workout: ['fitness', 'yoga'],
  exercise: ['fitness', 'yoga'],
  gift: [],
  desk: ['desk', 'organizer', 'chair'],
  wfh: ['desk', 'chair', 'hub'],
  sleep: ['wellness'],
  bp: ['blood pressure', 'monitor'],
  health: ['health', 'wellness', 'monitor'],
};

const STOPWORDS = new Set(('a an the i im i\'m me my we you your for to of and or in on at with is are am be ' +
  'can could would should do does any some something show find get want need looking look suggest recommend ' +
  'please under below within less than around budget rs inr item items product products buy good best what which ' +
  'fits fit group age offers offer deals deal discount discounts active there have has thing things ' +
  'suit suits suitable ideas idea pick picks recommendation recommendations else more other like love prefer into ' +
  'today now new nice cool great tell give help').split(' '));

/** Pull a rupee budget out of free text: "under 2k", "below ₹1,500", "5000 budget". */
function extractBudget(message) {
  const text = lower(message).replace(/,/g, '');
  const match = text.match(/(?:under|below|within|less than|upto|up to|max|budget(?: of)?|around)\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?/)
    || text.match(/(?:rs\.?|₹|inr)\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?/)
    || text.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)\b/);
  if (!match) return null;
  let amount = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'k' || unit === 'thousand') amount *= 1000;
  if (unit === 'lakh' || unit === 'lac') amount *= 100000;
  return amount > 0 ? Math.round(amount) : null;
}

/**
 * Free-text product search for the assistant's fallback mode.
 * @returns {{ items: Array, budget: number|null, wantsDeals: boolean, matchedTerms: string[] }}
 */
function searchCatalog({ message, customer, catalog, limit = 3, fallbackBudget = null, boostTerms = [] }) {
  const segment = ageSegment(customer.age);
  const statedBudget = extractBudget(message);
  const budget = statedBudget || fallbackBudget;
  const wantsDeals = /\b(offer|offers|deal|deals|discount|discounts|sale)\b/i.test(message);

  const words = lower(message).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w) && !/^\d/.test(w));
  const terms = [...new Set(words.flatMap(w => [w, ...(SYNONYMS[w] || [])]))];

  let pool = catalog.filter(p => p.stock > 0);
  if (budget) pool = pool.filter(p => unitPrice(p) <= budget);
  if (wantsDeals) pool = pool.filter(hasDiscount);

  const matchedTerms = new Set();
  const scored = pool.map(product => {
    let score = 0;
    terms.forEach(term => {
      if (lower(product.name).includes(term)) { score += 5; matchedTerms.add(term); }
      else if ((product.tags || []).some(t => lower(t).includes(term))) { score += 3; matchedTerms.add(term); }
      else if (lower(product.category) === term) { score += 3; matchedTerms.add(term); }
      else if (term.length > 3 && lower(product.description).includes(term)) { score += 1; matchedTerms.add(term); }
    });
    const relevance = score;
    // Remembered interests nudge the ranking but never count as a direct match
    if (boostTerms.some(t => matchesTerm(product, t) || lower(product.category) === lower(t))) score += 1.5;
    if (segment.categories.includes(product.category)) score += 1;
    if (hasDiscount(product)) score += 0.5;
    return { product, score, relevance };
  });

  const relevant = scored.filter(s => s.relevance > 0);
  const ranked = (relevant.length > 0 ? relevant : scored).sort((a, b) => b.score - a.score);

  return {
    items: ranked.slice(0, limit).map(s => s.product),
    budget,
    budgetFromMemory: !statedBudget && Boolean(fallbackBudget),
    wantsDeals,
    foundMatch: relevant.length > 0,
    matchedTerms: [...matchedTerms],
    searchedTerms: words,
  };
}

module.exports = { rankCrossSell, toSuggestion, searchCatalog, extractBudget };
