import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../App';

function Navbar() {
  const { customers, selectedCustomer, setSelectedCustomer, cart } = useApp();
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Catalog', icon: '🏪' },
    { path: '/cart', label: 'Cart', icon: '🛒' },
    { path: '/audit', label: 'Audit Trail', icon: '📋' },
    { path: '/admin', label: 'Admin', icon: '⚙️' },
  ];

  return (
    <nav style={{
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-primary)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
      }}>
        {/* Logo */}
        <Link to="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          textDecoration: 'none',
        }}>
          <span style={{ fontSize: '24px' }}>🧠</span>
          <span style={{
            fontSize: '20px',
            fontWeight: '700',
            letterSpacing: '-0.5px',
          }}>
            <span className="accent-text-gradient">Shop</span>
            <span style={{ color: 'var(--text-primary)' }}>Mind</span>
          </span>
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>AI</span>
        </Link>

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                fontWeight: '500',
                color: location.pathname === link.path ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: location.pathname === link.path ? 'var(--accent-glow)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              <span>{link.icon}</span>
              <span>{link.label}</span>
              {link.path === '/cart' && cart.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  background: 'var(--accent-primary)',
                  color: '#0F0D0B',
                  fontSize: '10px',
                  fontWeight: '700',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Customer Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Persona:</span>
          <select
            value={selectedCustomer?.id || ''}
            onChange={(e) => {
              const c = customers.find(c => c.id === e.target.value);
              setSelectedCustomer(c);
            }}
            className="input-field"
            style={{
              width: 'auto',
              padding: '6px 12px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.avatar} {c.name} (Age {c.age})
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
