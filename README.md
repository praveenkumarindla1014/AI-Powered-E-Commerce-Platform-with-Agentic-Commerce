# ShopMind AI

> An AI-assisted storefront where every recommendation explains itself, every money action is bounded and gated, and every decision lands in a live audit trail. Built for the Razorpay "AI Growth & Agentic Commerce" hackathon.

## Problem

AI agents are about to start shopping, negotiating and paying on behalf of people — Razorpay's ACP, Visa's AP2, Coinbase's x402 and NPCI's UAP are all building agent-native payment protocols. Most storefronts aren't ready: they treat every buyer as a human clicking buttons, and they have no way to show *why* an automated decision was made. ShopMind is a prototype of a merchant that can serve both human and AI buyers safely.

## Features

| Area | What it does |
| --- | --- |
| **Catalog** | 18 curated products across electronics, gaming, fashion, health and home; optional import from the DummyJSON API |
| **Explainable cross-sell** | One suggestion per cart with plain-language reasoning and a confidence score. Uses your AI provider, or a deterministic rules engine when none is configured |
| **Guardrails** | Suggested items must cost ≤ a configurable % of the cart, be in stock and not already in the cart. Blocked proposals are shown and logged, and the best item that *does* fit is offered instead |
| **Payment gate** | Payments above a threshold (default ₹2,000) are refused by the server until the shopper explicitly confirms |
| **Checkout** | Razorpay Orders API + Checkout.js with server-side HMAC verification, or a built-in test checkout when no keys are set. Totals are always recomputed on the server |
| **One-tap UPI** | Pay with a saved UPI mandate, approved by a security PIN that is verified on the server (5 wrong attempts → 10-minute lock) |
| **Failure simulation** | A test card that is always declined — shows a friendly "no charge was made" message and logs the failure |
| **Orders** | Order history per customer; paying reduces stock and updates the customer's purchase history, which feeds future suggestions |
| **AI assistant** | Chat widget that understands budgets ("under 2k"), offers, product questions, "what's in my cart", EMI dues and paying for the cart |
| **Assistant memory** | The conversation is saved per customer on the server and restored after refreshes, persona switches and restarts. The assistant remembers facts you state (budget, interests, who you shop for), uses them in later answers, and knows which product you're viewing ("is this good for beginners?"). The 🧠 Memory panel shows every fact, and each one can be deleted — or everything cleared |
| **Retail UI** | Bright storefront inspired by Flipkart, Amazon, Myntra and Meesho: gradient header with search, category bar, banner carousel, category tiles, deal shelves, rating badges, wishlist, recently viewed, Flipkart-style product page |
| **Abandoned-cart recovery** | After a configurable idle time the cart is saved and a 24-hour recovery link is created; opening it restores the cart |
| **Payment-method ordering** | The customer's most likely method is shown first (never hiding any method) |
| **EMI** | No-cost EMI offered only above a threshold; existing EMI plans show due/overdue installments and can be paid in order with the PIN |
| **Audit trail** | Every suggestion, block, gate, payment, failure, PIN rejection and admin change — searchable, filterable, with full details |
| **Admin** | Guardrail and feature settings (persisted), discounts, recovery links, catalog import, one-click demo reset |

## Tech stack

- **Frontend:** React 19, React Router 7, Vite 8 (hand-written CSS design system)
- **Backend:** Node.js 18+ and Express 4
- **AI:** any OpenAI-compatible chat completions API (OpenAI, DeepSeek, AgentRouter…), optional
- **Payments:** Razorpay test mode (Orders API, Checkout.js, signature verification), optional
- **Storage:** JSON files, seeded from `backend/data/seed/`

## Getting started

```bash
# 1. Install
cd backend && npm install
cd ../frontend && npm install

# 2. (Optional) configure integrations
cp ../.env.example ../backend/.env   # then edit backend/.env

# 3. Run — two terminals
cd backend && npm run dev            # http://localhost:5000
cd frontend && npm run dev           # http://localhost:3000
```

Everything works without any keys: suggestions and the assistant fall back to the rules engine, and checkout uses the built-in test checkout. The footer shows which mode is active.

**Test accounts:** pick a persona in the navbar (Arjun 22, Priya 35, Ramesh 52, Sneha 28). Every persona's security PIN is `1234`.

### Environment variables (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | API key for the AI provider (omit to use the rules engine) |
| `OPENAI_BASE_URL` | Provider base URL, default `https://api.openai.com/v1` |
| `AI_MODEL` | Model name, default `gpt-4o-mini` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **test** keys (omit to use the built-in test checkout) |
| `PORT` | Backend port, default `5000` |
| `FRONTEND_URL` | Used in recovery links and CORS, default `http://localhost:3000` |

### Data

Runtime data lives in `backend/data/*.json` (git-ignored) and is created from `backend/data/seed/` on first start. Use **Admin → Catalog & data → Reset all demo data** to start fresh.

### Tests

```bash
cd backend && npm test      # API tests against a throwaway copy of the seed data
cd backend && npm run test:ai   # checks that your AI provider answers
cd frontend && npm run lint && npm run build
```

## How this meets the bar

1. **Explainable** — every suggestion carries a one-sentence reason and a confidence score, shown in the cart ("Why this?"). The assistant explains why each item fits.
2. **Bounded** — `backend/services/guardrails.js` holds pure, deterministic rules that run *outside* the LLM: price cap as a % of cart value, stock, no duplicates. The AI is only a proposer; the guardrail decides. When a proposal is blocked, the shopper sees which item was blocked and why.
3. **Gated** — the server refuses to create an order above the auto-approve threshold until the shopper confirms; saved-UPI and assistant payments require a PIN verified on the server. Nothing in the browser can bypass either check.
4. **Audit trail** — `/audit` shows a timestamped, searchable record of every suggestion (generated, blocked, accepted, dismissed), gate, order, payment success or failure, PIN rejection, EMI payment, recovery link and setting change, each with its reasoning and details.
5. **Graceful failure** — "Simulate" on the cart page runs a payment that the bank declines. The shopper sees "Payment couldn't be completed — no charge was made", the cart stays intact, the order is marked failed, and the failure is logged. AI or gateway outages fall back to the rules engine or a clear error instead of crashing.

## Project structure

```
backend/
  server.js               # Express app, routes, error handling
  routes/                 # products, customers, suggest, assistant, payments, orders, growth, audit, admin
  services/               # guardrails, pricing, recommender, openaiService, razorpayService, orders, emi, store, auditLogger
  data/seed/              # committed seed data
  tests/                  # node:test API tests
frontend/src/
  context/                # app state: customers, catalog, cart, toasts
  components/             # Navbar, ProductCard, SuggestionPanel, PaymentModal, AIAssistant, ...
  pages/                  # Home, ProductDetail, Cart, Orders, Wishlist, Audit, Admin, Recover
```

## License

MIT
