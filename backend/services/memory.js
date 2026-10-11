/**
 * Assistant memory — what the shopping assistant remembers about each customer
 * across sessions: the recent conversation plus a few explicit facts
 * (budget, interests, who they shop for) extracted deterministically from
 * what the customer actually said. Customers can see and delete every fact.
 */
const store = require('./store');
const { extractBudget } = require('./recommender');

const MAX_MESSAGES = 40;
const MAX_INTERESTS = 8;
const MAX_RECIPIENTS = 5;

const RECIPIENTS = ['mom', 'mother', 'dad', 'father', 'wife', 'husband', 'son', 'daughter', 'sister', 'brother',
  'friend', 'girlfriend', 'boyfriend', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'kids', 'boss', 'colleague'];

const NOT_INTERESTS = new Set(['something', 'anything', 'things', 'stuff', 'items', 'it', 'that', 'this', 'one', 'gift', 'gifts', 'you', 'buying', 'shopping', 'products']);

function emptyMemory() {
  return { messages: [], facts: { budget: null, interests: [], recipients: [] }, updatedAt: null };
}

function getMemory(customerId) {
  const all = store.read('assistant_memory');
  const memory = all[customerId] || emptyMemory();
  return { ...emptyMemory(), ...memory, facts: { ...emptyMemory().facts, ...memory.facts } };
}

function saveMemory(customerId, memory) {
  const all = store.read('assistant_memory');
  all[customerId] = { ...memory, updatedAt: new Date().toISOString() };
  store.write('assistant_memory', all);
}

function clearMemory(customerId) {
  const all = store.read('assistant_memory');
  delete all[customerId];
  store.write('assistant_memory', all);
}

function addUnique(list, value, max) {
  const v = value.toLowerCase().trim();
  return [v, ...list.filter(x => x !== v)].slice(0, max);
}

/**
 * Pull durable facts out of a customer's message.
 * @param {string} message
 * @param {string[]} catalogTerms - matched catalog words (categories/tags) for this message
 * @returns {{ budget?: number, interests: string[], recipients: string[] }}
 */
function extractFacts(message, catalogTerms = []) {
  const text = message.toLowerCase();
  const facts = { interests: [], recipients: [] };

  const budget = extractBudget(message);
  if (budget) facts.budget = budget;

  // "I like / love / prefer / am into X", "I'm looking for X", "I need X"
  const likeMatch = text.match(/\bi(?:'m| am)? (?:really )?(?:like|love|prefer|am into|'m into|enjoy|play|do)\s+([a-z][a-z\s-]{2,30}?)(?:[.,!?]|\band\b|$)/);
  if (likeMatch) {
    const phrase = likeMatch[1].trim().split(/\s+/).slice(0, 3).join(' ');
    if (!NOT_INTERESTS.has(phrase)) facts.interests.push(phrase);
  }

  // Anything in the message that matches the catalog's vocabulary is an interest
  catalogTerms.filter(t => t.length > 2 && !NOT_INTERESTS.has(t)).forEach(t => facts.interests.push(t));

  // "for my mom", "gift for my wife"
  const recipientMatch = text.match(/\bfor (?:my |our )?([a-z]+)\b/g) || [];
  recipientMatch
    .map(m => m.replace(/^for (?:my |our )?/, ''))
    .filter(r => RECIPIENTS.includes(r))
    .forEach(r => facts.recipients.push(r));

  return facts;
}

/** Merge newly extracted facts into memory; returns the list of things just learned. */
function learn(memory, extracted) {
  const learned = [];
  if (extracted.budget && extracted.budget !== memory.facts.budget) {
    memory.facts.budget = extracted.budget;
    learned.push(`budget ₹${extracted.budget.toLocaleString('en-IN')}`);
  }
  extracted.interests.forEach(i => {
    if (!memory.facts.interests.includes(i)) learned.push(`interest "${i}"`);
    memory.facts.interests = addUnique(memory.facts.interests, i, MAX_INTERESTS);
  });
  extracted.recipients.forEach(r => {
    if (!memory.facts.recipients.includes(r)) learned.push(`shopping for ${r}`);
    memory.facts.recipients = addUnique(memory.facts.recipients, r, MAX_RECIPIENTS);
  });
  return learned;
}

function remember(memory, message) {
  memory.messages = [...memory.messages, { ...message, at: new Date().toISOString() }].slice(-MAX_MESSAGES);
}

/** Remove one fact: { type: 'budget' } or { type: 'interest' | 'recipient', value } */
function forget(customerId, { type, value }) {
  const memory = getMemory(customerId);
  if (type === 'budget') memory.facts.budget = null;
  if (type === 'interest') memory.facts.interests = memory.facts.interests.filter(i => i !== value);
  if (type === 'recipient') memory.facts.recipients = memory.facts.recipients.filter(r => r !== value);
  saveMemory(customerId, memory);
  return memory;
}

/** One-line summary for prompts and audit logs. */
function describeFacts(facts) {
  const parts = [];
  if (facts.budget) parts.push(`usual budget ₹${facts.budget.toLocaleString('en-IN')}`);
  if (facts.interests.length) parts.push(`interested in ${facts.interests.join(', ')}`);
  if (facts.recipients.length) parts.push(`shops for their ${facts.recipients.join(', ')}`);
  return parts.length ? parts.join('; ') : 'nothing yet';
}

module.exports = { getMemory, saveMemory, clearMemory, extractFacts, learn, remember, forget, describeFacts };
