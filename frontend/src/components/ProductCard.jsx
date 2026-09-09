import { Link } from 'react-router-dom';
import { useApp } from '../App';

function ProductCard({ product }) {
  const { addToCart } = useApp();

  const discountedPrice = product.discount_active
    ? product.price * (1 - product.discount_percent / 100)
    : product.price;

  return (
    <div className="glass-card stagger-item" style={{
      padding: '0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Product Image/Emoji Area */}
      <Link to={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
        <div style={{
          height: '160px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))',
          position: 'relative',
          fontSize: '56px',
          overflow: 'hidden',
        }}>
          {product.image && product.image.startsWith('http') ? (
            <img
              src={product.image}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
              loading="lazy"
            />
          ) : (
            product.image || '📦'
          )}

          {/* Discount Badge */}
          {product.discount_active && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              color: '#0F0D0B',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: '700',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}>
              {product.discount_percent}% OFF
            </div>
          )}

          {/* Stock indicator */}
          {product.stock < 10 && (
            <div style={{
              position: 'absolute',
              bottom: '8px',
              left: '12px',
              fontSize: '11px',
              color: product.stock <= 3 ? 'var(--error)' : 'var(--warning)',
              fontWeight: '600',
            }}>
              {product.stock <= 3 ? `Only ${product.stock} left!` : `${product.stock} in stock`}
            </div>
          )}
        </div>
      </Link>

      {/* Product Info */}
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>
            {product.category}
          </span>
        </div>

        <Link to={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
          <h3 style={{
            fontSize: '15px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            lineHeight: '1.3',
            marginBottom: '4px',
          }}>
            {product.name}
          </h3>
        </Link>

        <p style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: '1.4',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {product.description}
        </p>

        {/* Price */}
        <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '20px',
              fontWeight: '700',
              color: 'var(--accent-primary)',
            }}>
              ₹{Math.round(discountedPrice).toLocaleString()}
            </span>
            {product.discount_active && (
              <span style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                textDecoration: 'line-through',
              }}>
                ₹{product.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Add to Cart Button */}
        <button
          className="btn-primary"
          onClick={() => addToCart(product)}
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          disabled={product.stock <= 0}
        >
          {product.stock <= 0 ? 'Out of Stock' : '🛒 Add to Cart'}
        </button>
      </div>
    </div>
  );
}

export default ProductCard;
