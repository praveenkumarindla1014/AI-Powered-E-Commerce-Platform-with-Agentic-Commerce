import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Audit from './pages/Audit';
import Admin from './pages/Admin';
import AIAssistantWidget from './components/AIAssistantWidget';
import { getCustomers } from './api';

// Global Context
export const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

function App() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const data = await getCustomers();
      setCustomers(data.customers);
      if (data.customers.length > 0) {
        setSelectedCustomer(data.customers[0]);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    showToast('success', 'Added to Cart', `${product.name} has been added to your cart`);
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(item => item.id !== productId));
  }

  function updateCartQuantity(productId, quantity) {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  }

  function clearCart() {
    setCart([]);
  }

  function showToast(type, title, message, duration = 4000) {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const cartTotal = cart.reduce((sum, item) => {
    const discountedPrice = item.discount_active
      ? item.price * (1 - item.discount_percent / 100)
      : item.price;
    return sum + discountedPrice * item.quantity;
  }, 0);

  const contextValue = {
    customers,
    selectedCustomer,
    setSelectedCustomer,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    cartTotal,
    showToast,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Router>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </main>
          <footer style={{
            textAlign: 'center',
            padding: '24px',
            borderTop: '1px solid var(--border-primary)',
            color: 'var(--text-muted)',
            fontSize: '13px'
          }}>
            <span style={{ color: 'var(--accent-primary)' }}>ShopMind AI</span> — Agentic Commerce Demo | Built for Razorpay Hackathon
          </footer>
        </div>
        <Toast toasts={toasts} onRemove={removeToast} />
        <AIAssistantWidget />
      </Router>
    </AppContext.Provider>
  );
}

export default App;
