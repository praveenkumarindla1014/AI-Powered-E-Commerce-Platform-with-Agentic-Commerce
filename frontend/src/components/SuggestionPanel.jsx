import { Link } from 'react-router-dom';
import { ProductImage } from './ui';
import { formatINR, hasDiscount, unitPrice } from '../utils/format';

function SuggestionPanel({ suggestion, product, blocked, loading, onAccept, onDismiss }) {
  if (loading) {
    return (
      <div className="card card-accent">
        <div className="card-title">
          <span className="spinner" />
          <div>
            <h3>Finding something that goes with your cart…</h3>
            <p className="small muted">Checking your profile, searches and our guardrails</p>
          </div>
        </div>
        <div className="skeleton" style={{ height: 76 }} />
      </div>
    );
  }

  if (!suggestion && !blocked) return null;

  return (
    <div className="card card-accent fade-in">
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <h3>Recommended for you</h3>
          <p className="small muted">Explainable cross-sell, checked against store guardrails</p>
        </div>
        {suggestion && (
          <span className={`badge ${suggestion.source === 'ai' ? 'badge-accent' : 'badge-neutral'}`}>
            {suggestion.source === 'ai' ? 'AI pick' : 'Rules engine'}
          </span>
        )}
      </div>

      {blocked && (
        <div className="notice notice-warning" style={{ marginBottom: 14 }}>
          <div>
            <div className="notice-title">Guardrail blocked “{blocked.productName}”</div>
            {blocked.reason}
          </div>
        </div>
      )}

      {suggestion && product && (
        <>
          <div className="row" style={{ gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
            <Link to={`/product/${product.id}`} className="thumb"><ProductImage image={product.image} name={product.name} size={30} /></Link>
            <div className="grow">
              <Link to={`/product/${product.id}`} className="cart-line-name">{product.name}</Link>
              <div className="price-row" style={{ marginTop: 2 }}>
                <span style={{ fontWeight: 700 }}>{formatINR(unitPrice(product))}</span>
                {hasDiscount(product) && (
                  <>
                    <span className="small strike">{formatINR(product.price)}</span>
                    <span className="badge badge-success">{product.discount_percent}% off</span>
                  </>
                )}
              </div>
              <span className="small muted">Within the {formatINR(suggestion.maxPrice)} price cap for a {formatINR(suggestion.cartValue)} cart</span>
            </div>
          </div>

          <div className="reasoning" style={{ marginBottom: 14 }}>
            <div className="reasoning-label">Why this?</div>
            {suggestion.reasoning}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="row-between small" style={{ marginBottom: 6 }}>
              <span className="muted">Confidence</span>
              <span className="accent" style={{ fontWeight: 650 }}>{Math.round(suggestion.confidence * 100)}%</span>
            </div>
            <div className="confidence-track">
              <div className="confidence-fill" style={{ width: `${Math.round(suggestion.confidence * 100)}%` }} />
            </div>
          </div>

          <div className="row">
            <button className="btn btn-success grow" onClick={() => onAccept(suggestion, product)}>Add to cart</button>
            <button className="btn btn-secondary grow" onClick={() => onDismiss(suggestion)}>Show another</button>
          </div>
        </>
      )}
    </div>
  );
}

export default SuggestionPanel;
