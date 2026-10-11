# ShopMind AI — Frontend

React 19 + Vite storefront for ShopMind AI. See the [project README](../README.md) for setup.

```bash
npm install
npm run dev      # http://localhost:3000 (proxies /api to the backend on :5000)
npm run build    # production build in dist/
npm run lint     # oxlint
```

## Structure

```
src/
  api.js                 # all backend calls
  context/               # AppProvider (customers, catalog, cart, toasts) + useApp hook
  components/            # Navbar, ProductCard, SuggestionPanel, PaymentModal, AIAssistant, ...
  pages/                 # Home, ProductDetail, Cart, Orders, Audit, Admin, Recover
  utils/                 # formatting/pricing helpers, Razorpay loader
  index.css              # design system (CSS variables + component classes)
```
