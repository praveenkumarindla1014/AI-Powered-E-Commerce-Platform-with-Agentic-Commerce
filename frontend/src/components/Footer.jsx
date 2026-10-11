import { Link } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { categoryStyle, FEATURED_CATEGORIES } from '../utils/categories';

function Footer() {
  const { health } = useApp();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-cols">
          <div>
            <h4>ShopMind AI</h4>
            <p style={{ lineHeight: 1.6, maxWidth: 320 }}>
              Shopping with an assistant you can trust: every recommendation explains itself, stays within clear price limits, and big payments always wait for you.
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            {FEATURED_CATEGORIES.map(cat => <Link key={cat} to={`/?category=${cat}`}>{categoryStyle(cat).label}</Link>)}
          </div>
          <div>
            <h4>Your account</h4>
            <Link to="/orders">Orders & EMIs</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/cart">Cart</Link>
          </div>
          <div>
            <h4>Trust & safety</h4>
            <Link to="/audit">Audit trail</Link>
            <Link to="/admin">Seller admin</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ShopMind AI · explainable, bounded, gated agentic commerce</span>
          {health && (
            <span className="row wrap">
              <span>{health.ai ? '✦ AI provider connected' : '✦ Rules engine (no AI key)'}</span>
              <span>·</span>
              <span>{health.razorpay ? 'Razorpay test mode' : 'Built-in test checkout'}</span>
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

export default Footer;
