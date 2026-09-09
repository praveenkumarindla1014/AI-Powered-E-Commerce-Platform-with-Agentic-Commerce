# Demo Video Script — ShopMind AI

**Target length:** 3–5 minutes

### Complete Breakdown: Where & Why Razorpay Is Used In This System

1. **Razorpay Orders API (`POST /api/payments/create-order`)**
   - *Where:* Called from the Cart page when initiating checkout.
   - *Why:* Converts rupees to paise and registers a server-side order on Razorpay before checkout, preventing client-side price tampering.

2. **Razorpay Standard Checkout JS (`window.Razorpay`)**
   - *Where:* Embedded on `/cart` via `https://checkout.razorpay.com/v1/checkout.js`.
   - *Why:* Renders Razorpay's trusted, PCI-DSS compliant checkout modal with brand theming (`#D9822B`) and autofilled customer details.

3. **Razorpay HMAC Signature Verification (`POST /api/payments/verify-payment`)**
   - *Where:* Called immediately after payment completion in the Razorpay handler.
   - *Why:* Computes SHA-256 HMAC of `order_id|payment_id` against `RAZORPAY_KEY_SECRET` to verify cryptographic authenticity before order fulfillment.

4. **Razorpay Failure Simulation & Graceful Degradation (`POST /api/payments/simulate-failure`)**
   - *Where:* Triggered by the "🧪 Simulate Payment Failure" button on `/cart`.
   - *Why:* Uses Razorpay's decline testing flow to prove the agent and merchant handle banking failures cleanly without crashing or charging the buyer.

5. **Razorpay Payment Links API (`POST /api/cart/abandon` & `/admin`)**
   - *Where:* Triggered automatically when a cart sits idle for 60 seconds without checkout.
   - *Why:* Generates an instant, shareable Razorpay payment link (`https://rzp.io/...`) to recover abandoned revenue, tracked in the Admin dashboard.

6. **Razorpay Affordability Suite & EMI Agent (`POST /api/emi-suggest`)**
   - *Where:* Displayed as a suggestion card on `/cart` next to order summary.
   - *Why:* Recommends 3-month split payments for carts ≥ ₹3,000, boosting merchant Average Order Value (AOV) while adhering to ethical credit guardrails.

7. **Razorpay Dynamic Payment Method Optimization (`POST /api/payment-method-suggest`)**
   - *Where:* Configured into the checkout payment options modal.
   - *Why:* Dynamically prioritizes the customer's highest-converting method (UPI for youth, Card for professionals, Netbanking for seniors) to minimize checkout drop-offs.

8. **Razorpay Gated Transaction Enforcement & Audit Trail (`/audit`)**
   - *Where:* Evaluated before order creation and logged to the central audit dashboard.
   - *Why:* Automatically flags and gates transactions > ₹2,000 requiring user confirmation, logging every Razorpay order ID, payment ID, and status for compliance.

9. **AI Agent Conversational Payment Links & Mobile Sync (`POST /api/suggest/assistant-chat`)**
   - *Where:* Available inside the floating "Ask AI Assistant" widget on every page.
   - *Why:* When a user asks the AI to *"make payment"*, it automatically retrieves their verified mobile number and UPI ID, generates a Razorpay payment link, checks EMI qualification, and dispatches a 1-click security approval prompt directly in chat.

---

## 0:00 – 0:15 — Hook

> "AI agents are about to start shopping and paying on our behalf. Here's how we made a merchant ready for that — safely."

Show the ShopMind AI landing page with the hero headline and dark Razorpay-inspired aesthetic.

---

## 0:15 – 0:45 — Customer Persona & Catalog

1. Show the catalog page with all 16 products across electronics, fashion, health, home & gaming.
2. Point out the discount banner at the top showing active live deals with smooth animations.
3. Open the customer persona dropdown in the navbar.
4. Select **Ramesh (Age 52)** — mention his profile: health-conscious, past purchase of blood pressure monitor, searches for walking shoes and comfort items.

---

## 0:45 – 1:30 — AI Suggestion Flow (Explainable + Bounded)

1. Find **"Walking Comfort Shoes"** (₹2,799) and click **"Add to Cart"**.
2. Navigate to the Cart page.
3. **AI Suggestion Panel appears**:
   - Suggested item: **Orthopedic Foot Cushions** (₹499 with 20% discount = ₹399).
   - **Reasoning**: "Based on your profile (age 52) and recent interest in 'walking shoes', this health item complements your cart."
   - **Confidence Score**: 82% with animated progress fill.
   - **Guardrail Rule**: Price ₹399 is well within the 30% price limit of the cart (₹2,799 × 30% = ₹839 max).
4. Click **"Accept & Add to Cart"** → cart updates to 2 items (Total: ₹3,198).

---

## 1:30 – 2:00 — Growth Features in Action

### A. EMI/BNPL Suggestion Agent (Feature 3)
- Notice the **EMI Suggestion Card** immediately appears above checkout:
  - "💳 **EMI Available**: Split into 3 easy payments of **₹1,066**"
  - Reasoning: "Cart qualifies for EMI — many customers prefer splitting payments over ₹3,000"
  - **Guardrail**: Bounded by the ₹3,000 threshold (never pushes debt on small purchases).

### B. Smart Payment Method Recommender (Feature 2)
- Point out the explainability badge:
  - *"✨ We've put Netbanking first since that's usually fastest for you"*
  - Explain: For Ramesh (Age 52), Netbanking is ranked first, followed by Card, UPI, and Wallet.
  - **Guardrail**: Never hides any payment method — only optimizes the ranking.

---

## 2:00 – 2:45 — Gated Payment & Successful Checkout

1. Notice the **Payment Gate Warning**:
   - Because the total (₹3,198) exceeds the auto-approve threshold of ₹2,000, the system enforces a manual confirmation step.
2. Click **"✓ Confirm & Pay"**.
3. The checkout modal opens with the customer's reordered payment preferences.
4. Complete the test payment.
5. Success toast displays: *"Payment Successful! 🎉 ₹3,198 paid"*.

---

## 2:45 – 3:30 — Abandoned Cart Recovery (Feature 1)

1. Go back to Catalog, add **"Ergonomic Office Chair"** (₹8,999) to cart.
2. On the Cart page, wait for the idle timeout (60 seconds) without clicking pay.
3. Show the recovery banner popping up:
   - *"⏰ Still thinking? Here's a quick link to finish your order 👉 [Pay Now]"*
   - Generated payment link: `https://rzp.io/demo/plink_mock_...`
4. Show the admin view in `/admin` under **"Recovered Carts"** displaying the saved cart snapshot.

---

## 3:30 – 4:00 — Graceful Failure Simulation

1. Click **"🧪 Simulate Payment Failure"**.
2. The payment modal displays the test card that will be declined.
3. Click process → simulates bank decline.
4. Point out the **graceful error message**:
   - *"Payment couldn't be completed — no charge was made. Try again or use a different method."*
   - The app remains completely responsive with zero crashes.

---

## 4:00 – 4:30 — Live Audit Trail Dashboard

1. Navigate to **`/audit`**.
2. Point out the 4 stats counters: Total Events, Successful, Failed, Blocked.
3. Scroll through the table showing every logged event:
   - `suggestion_generated` (with visible plain-language reasoning)
   - `suggestion_accepted`
   - `payment_method_reorder` (explaining why Netbanking was placed first)
   - `emi_suggestion` (logging the ₹3,000 threshold check and 3-split amount)
   - `cart_recovery` (logging the generated recovery payment link)
   - `order_created` (noting whether it was auto-approved or gated)
   - `payment_success` & `payment_failed` (logging the exact failure reason)
4. Highlight how every action is:
   - **Explainable**: Reason provided in plain language.
   - **Bounded**: Guardrail policies enforced outside the LLM.
   - **Gated**: Confirmation step triggered above ₹2,000.
   - **Logged**: Stored in a permanent, verifiable audit trail.

---

### Feature 10: Mobile-Synced 1-Click Direct Pay with Stored Security PIN
1. Open the **Cart** page (`/cart`).
2. Notice the **Direct Pay (Mobile Synced)** card directly inside the Order Summary:
   - Displays the customer's authenticated phone number (`+91 98765 34562`) and UPI ID (`ramesh@sbi`).
   - Pre-stores the verified 4-digit security PIN (`1234`).
   - Tapping **"⚡ 1-Click Pay (Auto-Deduct)"** instantly authorizes payment via Razorpay, deducts the money, logs the transaction to the Audit Trail, and clears the cart.
   - Tapping **"🧪 Test Decline Condition"** demonstrates the graceful bank decline failure mode (*"Insufficient funds / authorization rejected — no money deducted"*).

---

## 4:30 – End — Closing

> "ShopMind AI demonstrates what agentic commerce readiness looks like for merchants. Whether transactions are driven by human shoppers or AI agents using protocols like ACP, AP2, or x402, every action is explainable, bounded, gated, and audited. Built for the Razorpay Hackathon with Express, React, Vite, and Razorpay test-mode APIs."
