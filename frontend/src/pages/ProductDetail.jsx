import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProducts } from '../api';
import { useApp } from '../App';

function ProductDetail() {
  const { id } = useParams();
  const { addToCart } = useApp();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    loadProduct();
  }, [id]);

  async function loadProduct() {
    try {
      const data = await getProducts();
      const found = data.products.find(p => p.id === id);
      setProduct(found);
    } catch (err) {
      console.error('Failed to load product:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Loading product...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>😕</div>
        <p style={{ color: 'var(--text-muted)' }}>Product not found</p>
        <Link to="/" className="btn-primary" style={{ marginTop: '16px', display: 'inline-flex' }}>
          ← Back to Catalog
        </Link>
      </div>
    );
  }

  const discountedPrice = product.discount_active
    ? product.price * (1 - product.discount_percent / 100)
    : product.price;

  return (
    <div className="page-container animate-fade-in">
      {/* Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '24px',
        fontSize: '13px',
        color: 'var(--text-muted)',
      }}>
        <Link to="/" style={{ color: 'var(--text-muted)' }}>Catalog</Link>
        <span>›</span>
        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{product.category}</span>
        <span>›</span>
        <span style={{ color: 'var(--text-primary)' }}>{product.name}</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '48px',
        alignItems: 'start',
      }}>
        {/* Product Image */}
        <div className="glass-card" style={{
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '120px',
          background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {product.image && product.image.startsWith('http') ? (
            <img
              src={product.image}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '16px' }}
            />
          ) : (
            product.image || '📦'
          )}
          {product.discount_active && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              color: '#0F0D0B',
              padding: '8px 16px',
              borderRadius: '999px',
              fontSize: '16px',
              fontWeight: '700',
            }}>
              {product.discount_percent}% OFF
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          <span className="badge badge-accent" style={{ marginBottom: '12px', textTransform: 'capitalize' }}>
            {product.category}
          </span>

          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            marginTop: '12px',
            marginBottom: '8px',
            letterSpacing: '-0.5px',
          }}>
            {product.name}
          </h1>

          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: '1.7',
            marginBottom: '24px',
          }}>
            {product.description}
          </p>

          {/* Price */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '12px',
            marginBottom: '24px',
          }}>
            <span style={{
              fontSize: '32px',
              fontWeight: '800',
              color: 'var(--accent-primary)',
            }}>
              ₹{Math.round(discountedPrice).toLocaleString()}
            </span>
            {product.discount_active && (
              <>
                <span style={{
                  fontSize: '18px',
                  color: 'var(--text-muted)',
                  textDecoration: 'line-through',
                }}>
                  ₹{product.price.toLocaleString()}
                </span>
                <span className="badge badge-success">
                  Save ₹{Math.round(product.price - discountedPrice).toLocaleString()}
                </span>
              </>
            )}
          </div>

          {/* Stock */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '24px',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: product.stock > 10 ? 'var(--success)' : product.stock > 0 ? 'var(--warning)' : 'var(--error)',
            }} />
            <span style={{
              fontSize: '14px',
              color: product.stock > 10 ? 'var(--success)' : product.stock > 0 ? 'var(--warning)' : 'var(--error)',
              fontWeight: '500',
            }}>
              {product.stock > 10 ? 'In Stock' : product.stock > 0 ? `Only ${product.stock} left` : 'Out of Stock'}
            </span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {product.tags.map(tag => (
              <span key={tag} style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-primary)',
              }}>
                #{tag}
              </span>
            ))}
          </div>

          {/* Quantity + Add to Cart */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '20px',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ padding: '6px 12px', minWidth: '36px', justifyContent: 'center' }}
              >−</button>
              <span style={{
                width: '40px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: '600',
              }}>
                {quantity}
              </span>
              <button
                className="btn-secondary"
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                style={{ padding: '6px 12px', minWidth: '36px', justifyContent: 'center' }}
              >+</button>
            </div>

            <button
              className="btn-primary"
              onClick={() => {
                for (let i = 0; i < quantity; i++) addToCart(product);
              }}
              style={{ flex: 1, justifyContent: 'center', padding: '12px 24px' }}
              disabled={product.stock <= 0}
            >
              🛒 Add {quantity > 1 ? `${quantity} Items` : ''} to Cart — ₹{Math.round(discountedPrice * quantity).toLocaleString()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetail;
