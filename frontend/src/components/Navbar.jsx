import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { logSearch } from '../api';
import { categoryStyle, FEATURED_CATEGORIES } from '../utils/categories';

function SearchBar() {
  const { customer, reloadCustomers } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') || '');

  async function handleSubmit(e) {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
    if (q && customer) {
      // Searches feed future recommendations; logging is best-effort
      logSearch(customer.id, q).then(reloadCustomers).catch(() => {});
    }
  }

  return (
    <form className="header-search" onSubmit={handleSubmit} role="search">
      <input
        type="search"
        placeholder="Search for products, brands and more"
        value={term}
        onChange={e => setTerm(e.target.value)}
        aria-label="Search products"
      />
      <button type="submit" aria-label="Search">⌕</button>
    </form>
  );
}

function Navbar() {
  const { customers, customer, selectCustomer, cartCount, wishlist } = useApp();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeCategory = location.pathname === '/' ? params.get('category') : null;

  return (
    <header className="navbar">
      <div className="navbar-top">
        <div className="navbar-inner">
          <Link to="/" className="brand" aria-label="ShopMind home">
            <span className="brand-mark">S</span>
            <span className="brand-text">
              <span className="brand-name">ShopMind</span>
              <span className="brand-tag">Explore <b>AI Plus ✦</b></span>
            </span>
          </Link>

          {/* Re-mount on navigation so the box reflects the current ?q= */}
          <SearchBar key={location.search} />

          <div className="nav-right">
            <select
              className="persona-select"
              value={customer?.id || ''}
              onChange={e => selectCustomer(e.target.value)}
              disabled={customers.length === 0}
              aria-label="Shopping as"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.avatar} {c.name}, {c.age}</option>
              ))}
            </select>
            <Link to="/orders" className="header-link" aria-label="Orders">
              <span className="icon" aria-hidden="true">📦</span><span className="label">Orders</span>
            </Link>
            <Link to="/wishlist" className="header-link" aria-label={`Wishlist, ${wishlist.length} items`}>
              <span className="icon" aria-hidden="true">♡</span><span className="label">Wishlist</span>
              {wishlist.length > 0 && <span className="count-bubble">{wishlist.length}</span>}
            </Link>
            <Link to="/cart" className="header-link" aria-label={`Cart, ${cartCount} items`}>
              <span className="icon" aria-hidden="true">🛒</span><span className="label">Cart</span>
              {cartCount > 0 && <span className="count-bubble">{cartCount}</span>}
            </Link>
          </div>
        </div>
      </div>

      <nav className="navbar-sub" aria-label="Categories">
        <div className="navbar-sub-inner">
          <NavLink to="/" end className={() => `sub-link${location.pathname === '/' && !activeCategory && !params.get('q') && !params.get('deals') ? ' active' : ''}`}>
            Home
          </NavLink>
          {FEATURED_CATEGORIES.map(cat => {
            const style = categoryStyle(cat);
            return (
              <Link key={cat} to={`/?category=${cat}`} className={`sub-link${activeCategory === cat ? ' active' : ''}`}>
                <span aria-hidden="true">{style.icon}</span>{style.label}
              </Link>
            );
          })}
          <Link to="/?deals=1" className={`sub-link deals${params.get('deals') ? ' active' : ''}`}>🏷️ Top Deals</Link>
          <span className="sub-spacer" />
          <NavLink to="/audit" className={({ isActive }) => `sub-link tool${isActive ? ' active' : ''}`}>Audit Trail</NavLink>
          <NavLink to="/admin" className={({ isActive }) => `sub-link tool${isActive ? ' active' : ''}`}>Seller Admin</NavLink>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
