import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/appContext';
import ProductCard from '../components/ProductCard';
import DealsStrip from '../components/DealsStrip';
import HeroCarousel from '../components/HeroCarousel';
import { EmptyState, Loading } from '../components/ui';
import { hasDiscount, unitPrice } from '../utils/format';
import { categoryStyle } from '../utils/categories';

const SORTS = {
  featured: { label: 'Relevance', fn: null },
  'price-asc': { label: 'Price — low to high', fn: (a, b) => unitPrice(a) - unitPrice(b) },
  'price-desc': { label: 'Price — high to low', fn: (a, b) => unitPrice(b) - unitPrice(a) },
  discount: { label: 'Discount', fn: (a, b) => (hasDiscount(b) ? b.discount_percent : 0) - (hasDiscount(a) ? a.discount_percent : 0) },
  rating: { label: 'Customer rating', fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
};

function matches(product, term) {
  const t = term.toLowerCase();
  return product.name.toLowerCase().includes(t)
    || product.category.toLowerCase().includes(t)
    || (product.brand || '').toLowerCase().includes(t)
    || (product.tags || []).some(tag => tag.toLowerCase().includes(t))
    || (product.description || '').toLowerCase().includes(t);
}

function Shelf({ title, subtitle, action, products, badge }) {
  if (products.length === 0) return null;
  return (
    <section className="shelf">
      <div className="shelf-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="small muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="shelf-row">
        {products.map(p => <ProductCard key={p.id} product={p} badge={badge} />)}
      </div>
    </section>
  );
}

function Home() {
  const { products, productsLoading, customer, recentlyViewed } = useApp();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState('featured');

  const query = params.get('q') || '';
  const category = params.get('category') || 'all';
  const dealsOnly = params.has('deals');
  const filtering = Boolean(query || dealsOnly || category !== 'all');

  const categories = useMemo(() => [...new Set(products.map(p => p.category))], [products]);

  const filtered = useMemo(() => {
    const list = products.filter(p =>
      (category === 'all' || p.category === category) &&
      (!dealsOnly || hasDiscount(p)) &&
      (!query || matches(p, query)));
    return SORTS[sort].fn ? [...list].sort(SORTS[sort].fn) : list;
  }, [products, query, category, dealsOnly, sort]);

  // Personalised shelf: segment categories first, recent searches boosted
  const picks = useMemo(() => {
    if (!customer) return [];
    const searches = customer.last_searches || [];
    return products
      .filter(p => p.stock > 0 && customer.segment?.categories.includes(p.category))
      .map(p => ({ p, score: (searches.some(s => matches(p, s)) ? 2 : 0) + (hasDiscount(p) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.p);
  }, [products, customer]);

  const deals = useMemo(
    () => products.filter(p => hasDiscount(p) && p.stock > 0).sort((a, b) => b.discount_percent - a.discount_percent).slice(0, 8),
    [products],
  );

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  if (productsLoading) return <div className="page"><Loading label="Loading the store…" /></div>;

  const heading = query
    ? `Results for “${query}”`
    : dealsOnly ? 'Top deals' : category !== 'all' ? categoryStyle(category).label : 'All products';

  return (
    <div className="page">
      {!filtering && (
        <>
          <HeroCarousel />

          <nav className="category-tiles" aria-label="Shop by category">
            {categories.slice(0, 5).map(cat => {
              const style = categoryStyle(cat);
              return (
                <button key={cat} className="category-tile" onClick={() => setFilter('category', cat)}>
                  <span className="category-icon" style={{ background: style.bg }} aria-hidden="true">{style.icon}</span>
                  {style.label}
                </button>
              );
            })}
            <Link to="/?deals=1" className="category-tile">
              <span className="category-icon" style={{ background: 'linear-gradient(135deg, #FFE1EA, #FFB3C7)' }} aria-hidden="true">🏷️</span>
              Top Deals
            </Link>
          </nav>

          <DealsStrip products={products} />

          {customer && (
            <Shelf
              title={`Picked for ${customer.name}`}
              subtitle={`Based on your profile (${customer.segment?.label}) and recent searches`}
              products={picks}
              badge="For you"
            />
          )}

          <Shelf
            title="Deals of the day"
            subtitle="Biggest discounts right now"
            products={deals}
            action={<Link to="/?deals=1" className="btn btn-blue btn-sm">View all</Link>}
          />

          <Shelf title="Recently viewed" products={recentlyViewed.slice(0, 8)} />
        </>
      )}

      <section className="shelf">
        <div className="shelf-title">
          <div>
            <h2>{heading}</h2>
            <p className="small muted">{filtered.length} product{filtered.length === 1 ? '' : 's'}</p>
          </div>
          <label className="row small secondary">
            Sort by
            <select className="input" style={{ width: 'auto', padding: '7px 10px' }} value={sort} onChange={e => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <div className="row wrap" style={{ marginBottom: 16 }}>
          <button className={`chip${category === 'all' && !dealsOnly ? ' active' : ''}`} onClick={() => setParams(query ? { q: query } : {})}>All</button>
          {categories.map(cat => (
            <button key={cat} className={`chip${category === cat ? ' active' : ''}`} onClick={() => setFilter('category', category === cat ? null : cat)}>
              {categoryStyle(cat).label}
            </button>
          ))}
          <button className={`chip${dealsOnly ? ' active' : ''}`} onClick={() => setFilter('deals', dealsOnly ? null : '1')}>🏷️ Deals</button>
          {filtering && <button className="btn btn-link small" onClick={() => setParams({})}>Clear filters</button>}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No products found"
            action={<button className="btn btn-blue" onClick={() => setParams({})}>Clear filters</button>}
          >
            Try a different search — or ask the ShopMind assistant to find something for you.
          </EmptyState>
        ) : (
          <div className="grid-products">
            {filtered.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

export default Home;
