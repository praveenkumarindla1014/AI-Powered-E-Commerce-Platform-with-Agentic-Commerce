import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppProvider';
import { useApp } from './context/appContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Toasts from './components/Toasts';
import AIAssistant from './components/AIAssistant';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Wishlist from './pages/Wishlist';
import Audit from './pages/Audit';
import Admin from './pages/Admin';
import Recover from './pages/Recover';
import NotFound from './pages/NotFound';

function ConnectionBanner() {
  const { loadError } = useApp();
  if (!loadError) return null;
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="notice notice-error">
        <div>
          <div className="notice-title">Can't load the store</div>
          {loadError} Start it with <span className="mono">npm run dev</span> in the <span className="mono">backend</span> folder, then refresh.
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="app-shell">
          <Navbar />
          <ConnectionBanner />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/recover/:linkId" element={<Recover />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <Toasts />
        <AIAssistant />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
