import { Link } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { ProductImage, Rating } from './ui';
import { formatINR, hasDiscount, unitPrice } from '../utils/format';

function ProductCard({ product, badge }) {
  const { addToCart, wishlist, toggleWishlist } = useApp();
  const discounted = hasDiscount(product);
  const outOfStock = product.stock <= 0;
  const saved = wishlist.includes(product.id);

  return (
    <article className="product-card">
      <button
        className={`wishlist-btn${saved ? ' on' : ''}`}
        onClick={() => toggleWishlist(product.id)}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={saved}
      >
        {saved ? '♥' : '♡'}
      </button>

      <Link to={`/product/${product.id}`} className="product-card-media" aria-label={product.name}>
        <ProductImage image={product.image} name={product.name} size={78} />
        {discounted
          ? <span className="ribbon">{product.discount_percent}% OFF</span>
          : badge && <span className="ribbon blue">{badge}</span>}
        {!outOfStock && product.stock < 10 && (
          <span className="stock-flag" style={{ color: product.stock <= 3 ? 'var(--error)' : 'var(--warning)' }}>
            Only {product.stock} left
          </span>
        )}
      </Link>

      <div className="product-card-body">
        <span className="product-brand">{product.brand || product.category.replace(/-/g, ' ')}</span>
        <Link to={`/product/${product.id}`} className="product-card-name">{product.name}</Link>
        {product.rating && <Rating value={product.rating} count={product.rating_count} />}

        <div className="price-row">
          <span className="price">{formatINR(unitPrice(product))}</span>
          {discounted && (
            <>
              <span className="small strike">{formatINR(product.price)}</span>
              <span className="off">{product.discount_percent}% off</span>
            </>
          )}
        </div>
        {unitPrice(product) >= 3000 && <span className="small muted">No-cost EMI available</span>}

        <div className="product-card-footer">
          <button className="btn btn-yellow btn-sm btn-block" onClick={() => addToCart(product.id)} disabled={outOfStock}>
            {outOfStock ? 'Out of stock' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
