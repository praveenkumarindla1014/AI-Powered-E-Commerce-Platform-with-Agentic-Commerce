# ShopMind AI 🧠

> AI-powered e-commerce demo with intelligent cross-sell suggestions, explainable reasoning, and Razorpay payments — built for the Razorpay "AI Growth & Agentic Commerce" hackathon.

## Problem Statement

AI agents are about to start shopping, negotiating, and paying on behalf of humans. The race is on: Razorpay's ACP, Visa's AP2, Coinbase's x402, NPCI's UAP — every major payments player is building agent-native protocols. But merchants aren't ready. Most storefronts still treat every buyer as a human clicking buttons. ShopMind AI is a prototype that shows how a merchant can serve both human and AI buyers — with every suggestion explainable, every money action bounded and gated, and every decision logged in a live audit trail.

## Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS
- **Backend:** Node.js + Express
- **AI Engine:** OpenAI API (gpt-4o-mini) for personalized cross-sell suggestions
- **Payments:** Razorpay Test Mode (Orders API, Payments API, Checkout.js)
- **Data Store:** JSON file store (products, customers, audit logs)
- **Notifications:** In-app toast notification system

## Features

- 🛍️ **Product Catalog** — 16 products across electronics, fashion, health, home & gaming
- 🤖 **AI Suggestion Engine** — Personalized cross-sell powered by OpenAI with visible reasoning
- 🛡️ **Guardrails** — Price-based limits, stock checks, payment gates (configurable via admin)
- 💳 **Razorpay Payments** — Full test-mode payment flow with order creation and verification
- 🧪 **Failure Simulation** — Deliberate payment failure demo with graceful error handling
- 📋 **Audit Trail** — Every suggestion, block, payment, and failure logged and viewable
- 👤 **Customer Personas** — 4 test profiles with different ages and purchase histories
- 🎉 **Discount System** — Active discounts with notification toasts and catalog banners
- 🧠 **Interactive AI Shopping Assistant** — Floating chat widget ("Ask AI Assistant / Ask Doubt") delivering age-bracket recommendations, past purchase price range matching, active offer checks, and in-chat Add to Cart
- ⏰ **Abandoned Cart Recovery** — Automatic Razorpay payment link generation for idle carts with admin recovery tracking
- 🎯 **Smart Payment Method Recommender** — Personalized payment method ranking based on customer demographic profile
- 📊 **EMI/BNPL Suggestion Agent** — Automated threshold-bounded 3-month installment suggestions on eligible cart values

## Setup Instructions

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd e_commerce

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Configure environment variables
# Create backend/.env with:
OPENAI_API_KEY=your_openai_key_here
RAZORPAY_KEY_ID=your_razorpay_test_key_here
RAZORPAY_KEY_SECRET=your_razorpay_test_secret_here
PORT=5000

# 5. Start the backend (from backend/ directory)
npm run dev

# 6. Start the frontend (from frontend/ directory, in a new terminal)
npm run dev

# 7. Visit http://localhost:3000
```

## How This Meets The Bar

1. **Explainable:** Every AI suggestion includes a one-line reasoning in plain language, a confidence score (0-1), and is displayed in the Suggestion Panel alongside the recommended product. Users see *why* the AI picked that item.

2. **Bounded:** The guardrails module enforces deterministic rules: suggested item price ≤ configurable % of cart value, items must be in stock, and age-based category preferences guide the AI. These rules run *outside* the LLM — they're pure functions in `guardrails.js`.

3. **Gated:** Payments above a configurable threshold (default ₹2,000) require an explicit "Confirm & Pay" step. The payment gate is visible in the cart before checkout proceeds.

4. **Audit Trail:** The `/audit` page shows a complete, timestamped log of every: suggestion generated, suggestion blocked by guardrail, suggestion accepted/dismissed, discount applied, order created, payment succeeded, and payment failed — with reasoning and amounts.

5. **Graceful Failure:** The "Simulate Payment Failure" button triggers a controlled failure scenario. The app shows a friendly error message ("Payment couldn't be completed — no charge was made"), logs the failure with reason in the audit trail, and does NOT crash.

## Team

- [Your Name / Team Name here]

## License

MIT
