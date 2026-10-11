# Demo Video Script — ShopMind AI

**Target length:** 3–5 minutes. Before recording: **Admin → Catalog & data → Reset all demo data**, then clear the audit trail.

## Where Razorpay is used

| # | Integration | Where | Why |
| --- | --- | --- | --- |
| 1 | **Orders API** — `POST /api/payments/create-order` | Cart → Checkout | The server prices the cart from the catalog and registers the order, so the browser can't change the amount |
| 2 | **Checkout.js** | Loaded on demand when test keys are set | Razorpay's PCI-DSS compliant checkout, themed and prefilled with the customer |
| 3 | **Signature verification** — `POST /api/payments/verify-payment` | After checkout completes | HMAC-SHA256 of `order_id\|payment_id` with the key secret; idempotent, so retries never double-charge or double-ship |
| 4 | **Failure handling** — `POST /api/payments/simulate-failure`, `report-failure` | Cart → "Test a declined payment" | Shows a declined payment handled gracefully: no charge, cart intact, failure logged |
| 5 | **Saved UPI mandate (simulated)** — `POST /api/payments/pin-pay` | Cart → One-tap UPI, and the assistant | Agent-style payment that still needs a server-verified PIN |
| 6 | **Payment gate** | Before any order above ₹2,000 | Server refuses until the shopper confirms |
| 7 | **Affordability (EMI)** — `POST /api/emi-suggest` | Cart summary and checkout's EMI tab | No-cost EMI offered only above ₹3,000 |
| 8 | **Method ordering** — `POST /api/payment-method-suggest` | Cart summary and checkout tabs | Most likely method first; nothing is hidden |
| 9 | **Recovery links** — `POST /api/cart/abandon` | Idle cart | 24-hour link that restores the cart |

---

## 0:00 – 0:15 — Hook

> "AI agents are about to start shopping and paying on our behalf. Here's a merchant that's ready for that — safely."

Show the home page: hero, live deals strip, "Picked for …" row.

## 0:15 – 0:45 — Personas & catalog

1. Open the persona switcher in the navbar and pick **Ramesh, 52** (past purchases: BP monitor, herbal tea; searches: walking shoes, comfort insoles).
2. Point out how "Picked for Ramesh" changes to health & comfort products.
3. Search for "walking" — the search is remembered and feeds future recommendations.

## 0:45 – 1:30 — Explainable, bounded suggestion

1. Open **Walking Comfort Shoes** (₹2,799) → **Add to cart** → open the cart.
2. The **Recommended for you** card appears:
   - Pick: e.g. **Orthopedic Foot Cushions** (₹399 after 20% off)
   - **Why this?** — a one-line reason tied to his searches
   - **Confidence** bar
   - "Within the ₹839 price cap for a ₹2,799 cart" — the 30% guardrail
3. Say: *the AI only proposes; a deterministic guardrail decides.* If the proposal breaks a rule, the card shows "Guardrail blocked …" with the reason and offers the best item that fits.
4. Click **Add to cart**. Optionally click **Show another** to show a dismissal being logged.

## 1:30 – 2:15 — Gate, EMI and checkout

1. Cart is now above ₹3,000 → **No-cost EMI available** appears; payment methods show **Netbanking first** (Ramesh's preference).
2. Click **Checkout** → the server answers with **Please confirm this payment** (above ₹2,000).
3. Click **Confirm & pay** → checkout opens (Razorpay with test keys, otherwise the built-in test checkout). Pay with UPI or choose the EMI tab.
4. You land on **Orders**: "Thank you! Your order is confirmed." Stock has gone down and Ramesh's purchase history now includes the shoes.

## 2:15 – 2:45 — Graceful failure

1. Add something to the cart again → **Test a declined payment → Simulate → Pay**.
2. Show "Payment couldn't be completed — No money was charged." The cart is untouched.
3. Try **One-tap UPI** with a wrong PIN (e.g. `0000`) → "Incorrect PIN — 4 attempts left". Then `1234` → paid.

## 2:45 – 3:30 — AI assistant

1. Click **Ask ShopMind**.
2. "Something for my knees under 1000" → recommendations within budget, with **Add** buttons.
3. "Do I have any EMI due?" → finds the next installment, pay it in chat with the PIN.
4. Add an item, then "Pay for my cart" → the assistant shows the amount and needs PIN approval — it never pays on its own.

## 3:30 – 4:00 — Abandoned cart recovery

1. (Set **Admin → Growth features → idle time** to 20s for the demo.) Leave a cart idle.
2. "Still deciding? We saved your cart." appears with a recovery link.
3. Open the link in a new tab → the cart is restored and marked "Welcome back!". **Admin → Recovery links** shows it as pending, then *recovered* after payment.

## 4:00 – 4:30 — Audit trail & close

1. Open **Audit Trail**: stats, filters, search. Click a row to see full details.
2. Point out: suggestion generated → blocked (if any) → accepted → payment gated → order created → payment failed → PIN rejected → payment succeeded → EMI paid → recovery link.

> "Explainable suggestions, deterministic guardrails, explicit gates and a full audit trail — that's how a merchant gets ready for agentic commerce."
