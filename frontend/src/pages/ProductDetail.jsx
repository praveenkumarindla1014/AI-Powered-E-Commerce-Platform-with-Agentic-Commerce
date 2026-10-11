import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/appContext';
import ProductCard from '../components/ProductCard';
import { EmptyState, Loading, ProductImage, QtyStepper, Rating } from '../components/ui';
import { formatINR, hasDiscount, unitPrice } from '../utils/format';
import { categoryStyle } from '../utils/categories';

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, productsLoading, addToCart, cart, wishlist, toggleWishlist, markViewed } = useApp();

  // Quantity is remembered per product, so it resets when navigating to another one
  const [selection, setSelection] = useState({ id, quantity: 1 });
  const quantity = selection.id === id ? selection.quantity : 1;
  const setQuantity = q => setSelection({ id, quantity: q });

  const product = products.find(p => p.id === id);

  // Record the visit for "Recently viewed" and the assistant's context
  useEffect(() => {
    if (product) markViewed(product.id);
  }, [product, markViewed]);

  if (productsLoading) return <div className="page"><Loading label="Loading product…" /></div>;

  if (!product) {
    return (
      <div className="page">
        <EmptyState icon="🔎" title="Product not found" action={<Link to="/" className="btn btn-blue">Back to the store</Link>}>
          It may have been removed from the catalog.
        </EmptyState>
      </div>
    );
  }

  const price = unitPrice(product);
  const discounted = hasDiscount(product);
  const inCart = cart.find(l => l.id === product.id)?.quantity || 0;
  const available = Math.max(0, product.stock - inCart);
  const qty = Math.min(quantity, Math.max(1, available));
  const saved = wishlist.includes(product.id);
  const related = products.filter(p => p.category === product.category && p.id !== product.id && p.stock > 0).slice(0, 8);
  const category = categoryStyle(product.category);

  function handleAdd() {
    addToCart(product.id, qty);
    setQuantity(1);
  }

  function handleBuyNow() {
    if (available > 0) addToCart(product.id, qty, { silent: true });
    navigate('/cart');
  }

  return (
    <div className="page fade-in">
      <nav className="small muted row" style={{ marginBottom: 14 }} aria-label="Breadcrumb">
        <Link to="/" className="muted">Home</Link>
        <span>›</span>
        <Link to={`/?category=${product.category}`} className="muted">{category.label}</Link>
        <span>›</span>
        <span className="secondary">{product.name}</span>
      </nav>

      <div className="card detail-layout" style={{ padding: 24 }}>
        {/* Left: image and primary actions */}
        <div className="stack" style={{ position: 'sticky', top: 'calc(var(--nav-height) + 16px)' }}>
          <div style={{ position: 'relative', height: 420, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(160deg, #F7F9FC, #E9EEF6)', border: '1px solid var(--border-primary)' }}>
            <ProductImage image={product.image} name={product.name} size={170} />
            {discounted && <span className="ribbon" style={{ top: 16, fontSize: 13 }}>{product.discount_percent}% OFF</span>}
            <button
              className={`wishlist-btn${saved ? ' on' : ''}`}
              style={{ top: 14, right: 14, width: 40, height: 40, fontSize: 20 }}
              onClick={() => toggleWishlist(product.id)}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={saved}
            >
              {saved ? '♥' : '♡'}
            </button>
          </div>
          <div className="row">
            <button className="btn btn-lg grow" style={{ background: '#FF9F00', color: 'white' }} disabled={available <= 0} onClick={handleAdd}>
              🛒 {product.stock <= 0 ? 'OUT OF STOCK' : available <= 0 ? 'ALL IN CART' : 'ADD TO CART'}
            </button>
            <button className="btn btn-lg grow" style={{ background: '#FB641B', color: 'white' }} disabled={product.stock <= 0} onClick={handleBuyNow}>
              ⚡ BUY NOW
            </button>
          </div>
        </div>

        {/* Right: details */}
        <div className="stack" style={{ gap: 16 }}>
          <div>
            {product.brand && <div className="product-brand" style={{ fontSize: 13, color: 'var(--text-muted)' }}>{product.brand}</div>}
            <h1 style={{ marginTop: 4, fontWeight: 600, fontSize: 24 }}>{product.name}</h1>
            {product.rating && (
              <div style={{ marginTop: 8 }}>
                <Rating value={product.rating} count={product.rating_count} />
                {product.rating_count && <span className="small muted"> ratings & reviews</span>}
              </div>
            )}
          </div>

          <div>
            {discounted && <div className="small success-text">Special price</div>}
            <div className="price-row">
              <span className="price-lg">{formatINR(price)}</span>
              {discounted && (
                <>
                  <span className="strike" style={{ fontSize: 17 }}>{formatINR(product.price)}</span>
                  <span className="off" style={{ fontSize: 16 }}>{product.discount_percent}% off</span>
                </>
              )}
            </div>
            <span className="small muted">Inclusive of all taxes · Free delivery</span>
          </div>

          <div className="card card-tight" style={{ boxShadow: 'none' }}>
            <h3 style={{ marginBottom: 10 }}>Available offers</h3>
            <ul className="offer-list">
              {discounted && <li><span className="offer-tag">🏷️ Deal</span><span>{product.discount_percent}% off — you save {formatINR(product.price - price)} on this item</span></li>}
              {price >= 3000 && <li><span className="offer-tag">💳 EMI</span><span>No-cost EMI from {formatINR(Math.ceil(price / 3))}/month for 3 months</span></li>}
              <li><span className="offer-tag">⚡ UPI</span><span>One-tap UPI checkout with your saved mandate and security PIN</span></li>
              <li><span className="offer-tag">🚚 Free</span><span>Free delivery on every order</span></li>
            </ul>
          </div>

          <div className="row wrap" style={{ gap: 18 }}>
            <span className="row" style={{ color: product.stock > 10 ? 'var(--success)' : product.stock > 0 ? 'var(--warning)' : 'var(--error)', fontWeight: 700 }}>
              ● {product.stock > 10 ? 'In stock' : product.stock > 0 ? `Hurry, only ${product.stock} left` : 'Out of stock'}
            </span>
            {inCart > 0 && <Link to="/cart" className="small">{inCart} in your cart →</Link>}
          </div>

          {available > 0 && (
            <div className="row">
              <span className="small secondary" style={{ fontWeight: 700 }}>Quantity</span>
              <QtyStepper value={qty} max={Math.max(1, available)} onChange={setQuantity} />
            </div>
          )}

          <div>
            <h3 style={{ marginBottom: 6 }}>Product details</h3>
            <p className="secondary" style={{ lineHeight: 1.7 }}>{product.description}</p>
          </div>

          {product.tags?.length > 0 && (
            <div className="row wrap">
              {product.tags.map(tag => <span key={tag} className="badge badge-neutral">#{tag}</span>)}
            </div>
          )}

          <p className="small muted">🔒 Payments are verified on our server, and orders above the auto-approve limit always need your confirmation.</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="shelf section">
          <div className="shelf-title"><h2>Similar products</h2></div>
          <div className="shelf-row">
            {related.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export default ProductDetail;
