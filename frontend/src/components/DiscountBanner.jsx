function DiscountBanner({ products }) {
  const discountedProducts = products.filter(p => p.discount_active && p.discount_percent > 0);

  if (discountedProducts.length === 0) return null;

  return (
    <div className="discount-banner" style={{ marginBottom: '24px' }}>
      <span style={{ fontSize: '20px' }}>🎉</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: '600', color: 'var(--accent-primary)', fontSize: '14px' }}>
          Active Deals:
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', marginLeft: '8px' }}>
          {discountedProducts.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' • '}
              <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{p.discount_percent}% off</span> {p.name}
            </span>
          ))}
        </span>
      </div>
      <span style={{
        background: 'var(--accent-primary)',
        color: '#0F0D0B',
        padding: '4px 12px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: '700',
        whiteSpace: 'nowrap',
      }}>
        {discountedProducts.length} DEAL{discountedProducts.length > 1 ? 'S' : ''} LIVE
      </span>
    </div>
  );
}

export default DiscountBanner;
