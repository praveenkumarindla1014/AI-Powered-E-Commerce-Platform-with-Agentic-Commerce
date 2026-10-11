import { useState } from 'react';
import { DEMO_PIN } from '../utils/format';

/** Product image that handles both emoji "images" and real URLs. */
export function ProductImage({ image, name, size = 56 }) {
  const isUrl = typeof image === 'string' && /^https?:\/\//.test(image);
  return (
    <div className="product-image">
      {isUrl
        ? <img src={image} alt={name} loading="lazy" />
        : <span className="product-image-emoji" style={{ fontSize: size }} role="img" aria-label={name}>{image || '📦'}</span>}
    </div>
  );
}

/** Flipkart-style rating: green score badge plus review count. */
export function Rating({ value, count }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="rating-badge">{Number(value).toFixed(1)} ★</span>
      {count ? <span className="rating-count">({Number(count).toLocaleString('en-IN')})</span> : null}
    </span>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-block">
      <span className="spinner spinner-lg" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = Infinity }) {
  return (
    <div className="qty-stepper">
      <button onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease quantity">−</button>
      <span aria-live="polite">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity">+</button>
    </div>
  );
}

/**
 * Security-PIN approval form. The PIN is verified by the server; the demo
 * PIN is shown as a hint because every persona is a test account.
 */
export function PinForm({ onSubmit, busy, label = 'Approve', compact = false }) {
  const [pin, setPin] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (pin.length >= 4 && !busy) onSubmit(pin, () => setPin(''));
  }

  return (
    <form onSubmit={handleSubmit} className="stack-sm">
      <div className="row">
        <input
          className="input input-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="PIN"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="Security PIN"
        />
        <button type="submit" className={`btn btn-primary grow${compact ? ' btn-sm' : ''}`} disabled={busy || pin.length < 4}>
          {busy ? <span className="spinner" style={{ width: 16, height: 16 }} /> : label}
        </button>
      </div>
      <span className="small muted">Test accounts use PIN <span className="mono">{DEMO_PIN}</span></span>
    </form>
  );
}
