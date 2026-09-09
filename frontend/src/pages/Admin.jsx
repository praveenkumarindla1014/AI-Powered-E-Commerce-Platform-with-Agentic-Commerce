import { useState, useEffect } from 'react';
import { getGuardrailConfig, updateGuardrailConfig, getProducts, toggleDiscount, getRecoveredCarts } from '../api';
import { useApp } from '../App';

function Admin() {
  const { showToast } = useApp();
  const [config, setConfig] = useState({
    maxSuggestionPricePercent: 30,
    maxAutoApproveAmount: 2000,
    abandonedCartTimeout: 60,
    emiThreshold: 3000,
    enableAbandonedCartRecovery: true,
    enablePaymentMethodReorder: true,
    enableEmiSuggestion: true,
  });
  const [products, setProducts] = useState([]);
  const [recoveredCarts, setRecoveredCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('guardrails');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [configData, productsData, cartsData] = await Promise.all([
        getGuardrailConfig(),
        getProducts(),
        getRecoveredCarts().catch(() => ({ carts: [] })),
      ]);
      setConfig(configData.config);
      setProducts(productsData.products);
      setRecoveredCarts(cartsData.carts || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    try {
      const data = await updateGuardrailConfig(config);
      setConfig(data.config);
      showToast('success', 'Settings Saved', 'All guardrail and growth feature settings updated');
    } catch (err) {
      showToast('error', 'Save Failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDiscount(productId, currentActive) {
    try {
      await toggleDiscount(productId, !currentActive);
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, discount_active: !currentActive } : p));
      showToast('success', 'Discount Updated', `Discount ${!currentActive ? 'enabled' : 'disabled'}`);
    } catch (err) { showToast('error', 'Update Failed', err.message); }
  }

  async function handleDiscountPercentChange(productId, percent) {
    try {
      await toggleDiscount(productId, undefined, Number(percent));
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, discount_percent: Number(percent) } : p));
    } catch (err) { console.error('Failed to update discount:', err); }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading admin settings...</p>
      </div>
    );
  }

  const tabs = [
    { key: 'guardrails', label: '🛡️ Guardrails', },
    { key: 'growth', label: '🚀 Growth Features', },
    { key: 'discounts', label: '🎉 Discounts', },
    { key: 'recovered', label: '📬 Recovered Carts', },
  ];

  return (
    <div className="page-container animate-fade-in">
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>
        ⚙️ Admin & Settings
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
        Configure guardrails, growth features, and product discounts
      </p>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 18px', borderRadius: 'var(--radius-md)', fontSize: '14px', fontWeight: '500', cursor: 'pointer', border: '1px solid', transition: 'all 0.2s ease',
            borderColor: activeTab === tab.key ? 'var(--accent-primary)' : 'transparent',
            background: activeTab === tab.key ? 'var(--accent-glow)' : 'transparent',
            color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== GUARDRAILS TAB ===== */}
      {activeTab === 'guardrails' && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>🛡️ Guardrail Rules</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Max Suggestion Price (% of cart value)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="5" max="100" value={config.maxSuggestionPricePercent} onChange={(e) => setConfig({ ...config, maxSuggestionPricePercent: Number(e.target.value) })} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                <span style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: '600', color: 'var(--accent-primary)', minWidth: '50px', textAlign: 'center' }}>
                  {config.maxSuggestionPricePercent}%
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>AI-suggested items must cost less than this % of the current cart total</p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Auto-Approve Payment Threshold (₹)
              </label>
              <input type="number" className="input-field" value={config.maxAutoApproveAmount} onChange={(e) => setConfig({ ...config, maxAutoApproveAmount: Number(e.target.value) })} min="0" step="500" />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Payments above this amount require explicit user confirmation (the "gate")</p>
            </div>

            <button className="btn-primary" onClick={handleSaveConfig} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? '⏳ Saving...' : '💾 Save Guardrail Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ===== GROWTH FEATURES TAB ===== */}
      {activeTab === 'growth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Feature Toggles */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>🚀 Feature Toggles</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Enable/disable each growth feature independently for a controlled demo
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { key: 'enableAbandonedCartRecovery', label: '⏰ Abandoned Cart Recovery', desc: 'Auto-generate recovery payment links for idle carts' },
                { key: 'enablePaymentMethodReorder', label: '💳 Smart Payment Method Reorder', desc: 'Reorder payment methods based on customer profile' },
                { key: 'enableEmiSuggestion', label: '📊 EMI/BNPL Suggestion', desc: 'Suggest EMI for high-value carts' },
              ].map(feature => (
                <div key={feature.key} style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)',
                }}>
                  <button onClick={() => setConfig({ ...config, [feature.key]: !config[feature.key] })} style={{
                    width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.3s ease',
                    background: config[feature.key] ? 'var(--success)' : 'var(--border-light)',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', transition: 'all 0.3s ease',
                      left: config[feature.key] ? '25px' : '3px',
                    }} />
                  </button>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{feature.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Configs */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>⚙️ Feature Settings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  ⏰ Abandoned Cart Timeout (seconds)
                </label>
                <input type="number" className="input-field" value={config.abandonedCartTimeout} onChange={(e) => setConfig({ ...config, abandonedCartTimeout: Number(e.target.value) })} min="10" step="10" />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Time before cart is considered abandoned (use 60s for demo)</p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  📊 EMI Suggestion Threshold (₹)
                </label>
                <input type="number" className="input-field" value={config.emiThreshold} onChange={(e) => setConfig({ ...config, emiThreshold: Number(e.target.value) })} min="500" step="500" />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Only suggest EMI for carts above this amount</p>
              </div>
            </div>

            <button className="btn-primary" onClick={handleSaveConfig} disabled={saving} style={{ marginTop: '20px' }}>
              {saving ? '⏳ Saving...' : '💾 Save Growth Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ===== DISCOUNTS TAB ===== */}
      {activeTab === 'discounts' && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>🎉 Product Discounts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' }}>
            {products.map(product => (
              <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                {product.image && product.image.startsWith('http') ? (
                  <img src={product.image} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }} />
                ) : (
                  <span style={{ fontSize: '24px' }}>{product.image || '📦'}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>₹{product.price.toLocaleString()}</div>
                </div>
                <input type="number" className="input-field" value={product.discount_percent} onChange={(e) => handleDiscountPercentChange(product.id, e.target.value)} min="0" max="90" style={{ width: '70px', padding: '6px 8px', fontSize: '13px', textAlign: 'center' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>%</span>
                <button onClick={() => handleToggleDiscount(product.id, product.discount_active)} style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: '600', border: '1px solid', cursor: 'pointer', transition: 'all 0.2s ease',
                  ...(product.discount_active ? { background: 'var(--success-bg)', borderColor: 'rgba(46, 204, 113, 0.3)', color: 'var(--success)' } : { background: 'transparent', borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }),
                }}>
                  {product.discount_active ? '● Active' : '○ Inactive'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== RECOVERED CARTS TAB ===== */}
      {activeTab === 'recovered' && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>📬 Recovered Cart Links</h2>
          {recoveredCarts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📭</span>
              <p>No abandoned carts recovered yet</p>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>Add items to cart and wait 60 seconds without checking out</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recoveredCarts.map(cart => (
                <div key={cart.id} style={{ padding: '14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>₹{cart.cartTotal?.toLocaleString()}</span>
                    <span className={`badge ${cart.status === 'paid' ? 'badge-success' : cart.status === 'expired' ? 'badge-error' : 'badge-warning'}`}>
                      {cart.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {new Date(cart.timestamp).toLocaleString()} • Customer: {cart.customerId}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Items: {cart.cartItems?.map(i => i.name).join(', ')}
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>
                    <a href={cart.recoveryLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
                      🔗 {cart.recoveryLink}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div style={{ marginTop: '32px', padding: '20px', background: 'var(--info-bg)', border: '1px solid rgba(52, 152, 219, 0.2)', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--info)', marginBottom: '8px' }}>ℹ️ How Everything Works</h3>
        <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2', paddingLeft: '20px' }}>
          <li><strong>Guardrails:</strong> Deterministic rules that bound AI suggestions and gate payments</li>
          <li><strong>Abandoned Cart:</strong> Recovery links generated after cart idle timeout — 1 per session max</li>
          <li><strong>Payment Reorder:</strong> Methods reordered by age/preference — all methods stay available (never hidden)</li>
          <li><strong>EMI Suggestion:</strong> Only shown above threshold — prevents suggesting debt on small purchases</li>
          <li><strong>All actions</strong> are logged in the <a href="/audit">Audit Trail</a> with reasoning</li>
        </ul>
      </div>
    </div>
  );
}

export default Admin;
