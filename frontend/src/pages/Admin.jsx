import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/appContext';
import {
  getGuardrailConfig, updateGuardrailConfig, updateDiscount, getRecoveredCarts,
  syncDummyJson, resetCatalog, resetDemoData,
} from '../api';
import { Loading, ProductImage } from '../components/ui';
import { formatDateTime, formatINR } from '../utils/format';

const TABS = [
  { key: 'guardrails', label: 'Guardrails' },
  { key: 'growth', label: 'Growth features' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'recovery', label: 'Recovery links' },
  { key: 'data', label: 'Catalog & data' },
];

const FEATURES = [
  { key: 'enableAbandonedCartRecovery', label: 'Abandoned cart recovery', desc: 'Save idle carts and create a 24-hour recovery link' },
  { key: 'enablePaymentMethodReorder', label: 'Smart payment method order', desc: "Show the customer's most likely method first — never hides any method" },
  { key: 'enableEmiSuggestion', label: 'EMI suggestions', desc: 'Offer no-cost EMI only for carts above the threshold' },
];

const CART_STATUS = { pending: 'badge-warning', recovered: 'badge-success', closed: 'badge-neutral', expired: 'badge-error' };

function NumberField({ label, hint, value, onChange, min, max, step, suffix }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="row">
        <input type="number" className="input" value={value} min={min} max={max} step={step} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        {suffix && <span className="muted">{suffix}</span>}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function DiscountRow({ product, onSaved }) {
  const { showToast } = useApp();
  const [percent, setPercent] = useState(product.discount_percent);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPercent(product.discount_percent); }, [product.discount_percent]);

  async function save(changes) {
    setSaving(true);
    try {
      await updateDiscount(product.id, changes);
      onSaved();
    } catch (err) {
      showToast('error', 'Could not update discount', err.message);
      setPercent(product.discount_percent);
    } finally {
      setSaving(false);
    }
  }

  function commitPercent() {
    if (Number(percent) !== product.discount_percent) save({ discount_percent: Number(percent) });
  }

  return (
    <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--border-primary)', gap: 12 }}>
      <div className="thumb" style={{ width: 36, height: 36 }}><ProductImage image={product.image} name={product.name} size={18} /></div>
      <div className="grow">
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
        <div className="small muted">{formatINR(product.price)} · {product.stock} in stock</div>
      </div>
      <input
        type="number" className="input" style={{ width: 74, padding: '6px 8px', textAlign: 'center' }} min={0} max={90}
        value={percent} onChange={e => setPercent(e.target.value)} onBlur={commitPercent}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={`Discount percent for ${product.name}`}
      />
      <span className="muted">%</span>
      <button
        className={`switch${product.discount_active ? ' on' : ''}`} disabled={saving}
        onClick={() => save({ discount_active: !product.discount_active })}
        aria-label={`${product.discount_active ? 'Disable' : 'Enable'} discount for ${product.name}`} aria-pressed={product.discount_active}
      />
    </div>
  );
}

function Admin() {
  const { products, reloadProducts, reloadCustomers, clearCart, showToast, health } = useApp();
  const [tab, setTab] = useState('guardrails');
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const [carts, setCarts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(null);

  useEffect(() => {
    getGuardrailConfig()
      .then(data => { setConfig(data.config); setSaved(data.config); })
      .catch(err => showToast('error', 'Could not load settings', err.message));
  }, [showToast]);

  useEffect(() => {
    if (tab === 'recovery') getRecoveredCarts().then(data => setCarts(data.carts)).catch(() => setCarts([]));
  }, [tab]);

  const dirty = config && saved && JSON.stringify(config) !== JSON.stringify(saved);

  async function handleSave() {
    setSaving(true);
    try {
      const data = await updateGuardrailConfig(config);
      setConfig(data.config);
      setSaved(data.config);
      showToast('success', 'Settings saved', 'Guardrails apply to the next suggestion and checkout');
    } catch (err) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runAction(key, fn, successTitle) {
    setWorking(key);
    try {
      const res = await fn();
      showToast('success', successTitle, res.message);
      return res;
    } catch (err) {
      showToast('error', 'Action failed', err.message);
      return null;
    } finally {
      setWorking(null);
    }
  }

  if (!config) return <div className="page"><Loading label="Loading settings…" /></div>;

  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const saveBar = (
    <div className="row" style={{ marginTop: 20 }}>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
      {dirty && <button className="btn btn-ghost" onClick={() => setConfig(saved)}>Discard</button>}
      {!dirty && <span className="small muted">All changes saved</span>}
    </div>
  );

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1>Admin</h1>
          <p>Configure guardrails, growth features, discounts and demo data. Every change is recorded in the <Link to="/audit">audit trail</Link>.</p>
        </div>
        {health && (
          <div className="row wrap">
            <span className={`badge ${health.ai ? 'badge-success' : 'badge-neutral'}`}>AI: {health.ai ? 'connected' : 'rules engine'}</span>
            <span className={`badge ${health.razorpay ? 'badge-success' : 'badge-neutral'}`}>Payments: {health.razorpay ? 'Razorpay test' : 'built-in test'}</span>
          </div>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'guardrails' && (
        <div className="card">
          <h2>Guardrail rules</h2>
          <p className="small muted" style={{ marginBottom: 20 }}>Deterministic rules that run outside the AI. They bound every suggestion and gate every payment.</p>
          <div className="stack" style={{ gap: 24 }}>
            <div>
              <label className="field-label">Max suggestion price — {config.maxSuggestionPricePercent}% of cart value</label>
              <input type="range" min={5} max={100} value={config.maxSuggestionPricePercent} onChange={e => set('maxSuggestionPricePercent', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
              <p className="field-hint">A ₹10,000 cart can receive suggestions up to {formatINR(10000 * config.maxSuggestionPricePercent / 100)}. Anything pricier is blocked and logged.</p>
            </div>
            <div className="grid-2">
              <NumberField
                label="Auto-approve payments up to (₹)" value={config.maxAutoApproveAmount} min={0} step={500}
                onChange={v => set('maxAutoApproveAmount', v)}
                hint="Larger payments need an explicit “Confirm & pay” step."
              />
            </div>
          </div>
          {saveBar}
        </div>
      )}

      {tab === 'growth' && (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Growth features</h2>
          <div className="stack">
            {FEATURES.map(f => (
              <div key={f.key} className="row" style={{ gap: 14, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <button className={`switch${config[f.key] ? ' on' : ''}`} onClick={() => set(f.key, !config[f.key])} aria-pressed={config[f.key]} aria-label={f.label} />
                <div>
                  <div style={{ fontWeight: 600 }}>{f.label}</div>
                  <div className="small muted">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid-2" style={{ marginTop: 24 }}>
            <NumberField label="Cart idle time before recovery" suffix="seconds" value={config.abandonedCartTimeout} min={10} step={10} onChange={v => set('abandonedCartTimeout', v)} hint="60 seconds works well for a live demo." />
            <NumberField label="EMI threshold (₹)" value={config.emiThreshold} min={500} step={500} onChange={v => set('emiThreshold', v)} hint="EMI is only offered for carts at or above this amount." />
          </div>
          {saveBar}
        </div>
      )}

      {tab === 'discounts' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '18px 16px 12px' }}>
            <h2>Product discounts</h2>
            <p className="small muted">Edit the percentage, then toggle the discount on. Prices update across the store immediately.</p>
          </div>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {products.map(p => <DiscountRow key={p.id} product={p} onSaved={reloadProducts} />)}
          </div>
        </div>
      )}

      {tab === 'recovery' && (
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Abandoned cart recovery links</h2>
          {carts.length === 0 ? (
            <p className="muted">No recovery links yet. Leave a cart idle for {config.abandonedCartTimeout} seconds to create one.</p>
          ) : (
            <div className="stack">
              {carts.map(c => (
                <div key={c.id} className="card card-tight" style={{ background: 'var(--bg-primary)' }}>
                  <div className="row-between wrap">
                    <strong>{c.customerName || c.customerId} · {formatINR(c.cartTotal)}</strong>
                    <span className={`badge ${CART_STATUS[c.status] || 'badge-neutral'}`}>{c.status}</span>
                  </div>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {formatDateTime(c.timestamp)} · {c.cartItems.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                  </p>
                  {c.status === 'pending' && <a className="small mono" href={c.recoveryLink}>{c.recoveryLink}</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'data' && (
        <div className="grid-2">
          <div className="card">
            <h2>Catalog</h2>
            <p className="small muted" style={{ margin: '6px 0 16px' }}>{products.length} products. Import real products from the DummyJSON API, or restore the curated catalog.</p>
            <div className="row wrap">
              <button className="btn btn-primary" disabled={!!working} onClick={async () => { if (await runAction('sync', () => syncDummyJson(30), 'Catalog synced')) reloadProducts(); }}>
                {working === 'sync' ? 'Importing…' : 'Import from DummyJSON'}
              </button>
              <button className="btn btn-secondary" disabled={!!working} onClick={async () => { if (await runAction('catalog', resetCatalog, 'Catalog restored')) reloadProducts(); }}>
                {working === 'catalog' ? 'Restoring…' : 'Restore default catalog'}
              </button>
            </div>
          </div>
          <div className="card">
            <h2>Demo data</h2>
            <p className="small muted" style={{ margin: '6px 0 16px' }}>Reset products, stock, customers, orders, EMIs, recovery links and settings to their original state. The audit trail is kept.</p>
            <button
              className="btn btn-danger" disabled={!!working}
              onClick={async () => {
                if (!window.confirm('Reset all demo data? Orders and settings will be lost.')) return;
                if (await runAction('reset', resetDemoData, 'Demo data reset')) {
                  clearCart();
                  reloadProducts();
                  reloadCustomers();
                  const data = await getGuardrailConfig();
                  setConfig(data.config);
                  setSaved(data.config);
                }
              }}
            >
              {working === 'reset' ? 'Resetting…' : 'Reset all demo data'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
