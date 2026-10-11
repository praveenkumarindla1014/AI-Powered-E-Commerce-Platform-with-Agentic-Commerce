import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext } from './appContext';
import { getCustomers, getHealth, getProducts } from '../api';
import { unitPrice } from '../utils/format';

const CART_KEY = 'shopmind.cart';
const CUSTOMER_KEY = 'shopmind.customer';
const WISHLIST_KEY = 'shopmind.wishlist';
const RECENT_KEY = 'shopmind.recent';
const MAX_RECENT = 12;

function readStoredCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(stored) ? stored.filter(i => i && typeof i.id === 'string' && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

function readStoredIds(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function AppProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(() => localStorage.getItem(CUSTOMER_KEY));
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [cart, setCart] = useState(readStoredCart); // [{ id, quantity }]
  const [recoveryLinkId, setRecoveryLinkId] = useState(null);
  const [wishlist, setWishlist] = useState(() => readStoredIds(WISHLIST_KEY));
  const [recentIds, setRecentIds] = useState(() => readStoredIds(RECENT_KEY));
  const [health, setHealth] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());

  // ---------- Toasts ----------
  const dismissToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(toastTimers.current.get(id));
    toastTimers.current.delete(id);
  }, []);

  const showToast = useCallback((type, title, message, duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-3), { id, type, title, message }]);
    toastTimers.current.set(id, setTimeout(() => dismissToast(id), duration));
  }, [dismissToast]);

  // ---------- Data loading ----------
  const reloadProducts = useCallback(async () => {
    try {
      const data = await getProducts();
      setProducts(data.products);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const reloadCustomers = useCallback(async () => {
    try {
      const data = await getCustomers();
      setCustomers(data.customers);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    reloadProducts();
    reloadCustomers();
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [reloadProducts, reloadCustomers]);

  const customer = customers.find(c => c.id === customerId) || customers[0] || null;

  const selectCustomer = useCallback(id => {
    setCustomerId(id);
    localStorage.setItem(CUSTOMER_KEY, id);
  }, []);

  // ---------- Cart ----------
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const findProduct = useCallback(id => products.find(p => p.id === id), [products]);

  const addToCart = useCallback((productId, quantity = 1, { silent = false } = {}) => {
    const product = findProduct(productId);
    if (!product) return;
    const inCart = cart.find(i => i.id === productId)?.quantity || 0;
    const allowed = Math.min(quantity, product.stock - inCart);

    if (allowed <= 0) {
      showToast('warning', 'Stock limit reached', `Only ${product.stock} of ${product.name} available`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === productId);
      if (existing) return prev.map(i => (i.id === productId ? { ...i, quantity: i.quantity + allowed } : i));
      return [...prev, { id: productId, quantity: allowed }];
    });
    if (!silent) showToast('success', 'Added to cart', `${allowed > 1 ? `${allowed} × ` : ''}${product.name}`);
  }, [cart, findProduct, showToast]);

  const setQuantity = useCallback((productId, quantity) => {
    const product = findProduct(productId);
    const capped = product ? Math.min(quantity, product.stock) : quantity;
    setCart(prev => (capped <= 0
      ? prev.filter(i => i.id !== productId)
      : prev.map(i => (i.id === productId ? { ...i, quantity: capped } : i))));
  }, [findProduct]);

  const removeFromCart = useCallback(productId => {
    setCart(prev => prev.filter(i => i.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setRecoveryLinkId(null);
  }, []);

  const replaceCart = useCallback(items => {
    setCart(items.map(({ id, quantity }) => ({ id, quantity })));
  }, []);

  // ---------- Wishlist & recently viewed ----------
  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  const toggleWishlist = useCallback(productId => {
    const product = products.find(p => p.id === productId);
    const saved = wishlist.includes(productId);
    setWishlist(prev => (saved ? prev.filter(id => id !== productId) : [productId, ...prev]));
    if (product) showToast(saved ? 'info' : 'success', saved ? 'Removed from wishlist' : 'Saved to wishlist', product.name, 2500);
  }, [products, wishlist, showToast]);

  const markViewed = useCallback(productId => {
    setRecentIds(prev => (prev[0] === productId ? prev : [productId, ...prev.filter(id => id !== productId)].slice(0, MAX_RECENT)));
  }, []);

  const wishlistProducts = useMemo(
    () => wishlist.map(id => products.find(p => p.id === id)).filter(Boolean),
    [wishlist, products],
  );
  const recentlyViewed = useMemo(
    () => recentIds.map(id => products.find(p => p.id === id)).filter(Boolean),
    [recentIds, products],
  );

  // Cart lines always use the latest catalog prices and discounts
  const cartLines = useMemo(() => cart
    .map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product) return null;
      const price = unitPrice(product);
      return { ...item, product, unitPrice: price, lineTotal: price * item.quantity };
    })
    .filter(Boolean), [cart, products]);

  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const cartSubtotal = cartLines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.lineTotal, 0);

  const value = {
    // integrations
    health,
    loadError,
    // customers
    customers,
    customer,
    selectCustomer,
    reloadCustomers,
    // catalog
    products,
    productsLoading,
    reloadProducts,
    findProduct,
    // cart
    cart: cartLines,
    cartCount,
    cartSubtotal,
    cartTotal,
    cartDiscount: cartSubtotal - cartTotal,
    addToCart,
    setQuantity,
    removeFromCart,
    clearCart,
    replaceCart,
    recoveryLinkId,
    setRecoveryLinkId,
    // wishlist & browsing history
    wishlist,
    wishlistProducts,
    toggleWishlist,
    recentlyViewed,
    markViewed,
    // notifications
    toasts,
    showToast,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
