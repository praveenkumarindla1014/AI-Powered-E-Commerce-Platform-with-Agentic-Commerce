import { useState } from 'react';
import { useApp } from '../App';

function SuggestionPanel({ suggestion, product, onAccept, onDismiss, loading }) {
  const [dismissed, setDismissed] = useState(false);

  if (loading) {
    return (
      <div className="glass-card animate-pulse-glow" style={{
        padding: '24px',
        marginTop: '20px',
        borderColor: 'var(--accent-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>🧠</span>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600' }}>AI is thinking...</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Analyzing your profile and cart to find the perfect suggestion
            </p>
          </div>
        </div>
        <div style={{
          height: '80px',
          background: 'linear-gradient(90deg, var(--bg-tertiary), var(--bg-secondary), var(--bg-tertiary))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s linear infinite',
          borderRadius: 'var(--radius-md)',
        }} />
      </div>
    );
  }

  if (!suggestion || !product || dismissed) return null;

  const discountedPrice = product.discount_active
    ? product.price * (1 - suggestion.discount_percent / 100)
    : product.price;

  return (
    <div className="glass-card animate-slide-up" style={{
      padding: '24px',
      marginTop: '20px',
      borderColor: 'var(--accent-border)',
      background: 'linear-gradient(135deg, var(--bg-card), rgba(217, 130, 43, 0.05))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          background: 'var(--accent-glow)',
          border: '1px solid var(--accent-border)',
        }}>
          🧠
        </div>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
            AI Suggestion
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Personalized recommendation for you
          </p>
        </div>
        <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>
          Powered by GPT
        </span>
      </div>

      {/* Product Suggestion */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '16px',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        marginBottom: '16px',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {product.image && product.image.startsWith('http') ? (
            <img
              src={product.image}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            product.image || '📦'
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
            {suggestion.suggestion_name}
          </h4>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-primary)' }}>
              ₹{Math.round(discountedPrice).toLocaleString()}
            </span>
            {suggestion.discount_percent > 0 && (
              <>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                  ₹{product.price.toLocaleString()}
                </span>
                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                  {suggestion.discount_percent}% OFF
                </span>
              </>
            )}
          </div>
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>
            {product.category}
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '16px',
        borderLeft: '3px solid var(--accent-primary)',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          💡 Why this was suggested
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
          {suggestion.reasoning}
        </p>
      </div>

      {/* Confidence Bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '6px',
          fontSize: '12px',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Confidence Score</span>
          <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
        <div className="confidence-bar-track">
          <div
            className="confidence-bar-fill"
            style={{ width: `${suggestion.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          className="btn-success"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => onAccept(suggestion, product)}
        >
          ✓ Accept & Add to Cart
        </button>
        <button
          className="btn-secondary"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => {
            setDismissed(true);
            onDismiss(suggestion);
          }}
        >
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
}

export default SuggestionPanel;
