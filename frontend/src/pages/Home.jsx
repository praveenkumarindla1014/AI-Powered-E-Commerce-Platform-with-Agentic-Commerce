import { useState, useEffect } from 'react';
import { getProducts, logSearch, syncDummyJson, resetDefaultProducts } from '../api';
import { useApp } from '../App';
import ProductCard from '../components/ProductCard';
import DiscountBanner from '../components/DiscountBanner';

function Home() {
  const { selectedCustomer, showToast } = useApp();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const data = await getProducts();
      setProducts(data.products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncDummyJson() {
    setSyncing(true);
    try {
      const res = await syncDummyJson(50);
      if (res.success) {
        showToast('success', 'DummyJSON Synced! 🎉', res.message);
        await loadProducts();
      }
    } catch (err) {
      showToast('error', 'Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleResetDefault() {
    setSyncing(true);
    try {
      const res = await resetDefaultProducts();
      if (res.success) {
        showToast('info', 'Catalog Reset', 'Restored default catalog.');
        await loadProducts();
      }
    } catch (err) {
      showToast('error', 'Reset Failed', err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    if (selectedCustomer) {
      try {
        await logSearch(selectedCustomer.id, searchTerm.trim());
      } catch (err) {
        console.error('Failed to log search:', err);
      }
    }
  }

  const categories = ['all', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="page-container">
      {/* Hero Section */}
      <div className="animate-fade-in" style={{
        textAlign: 'center',
        padding: '40px 20px 32px',
      }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: '800',
          marginBottom: '12px',
          letterSpacing: '-1px',
        }}>
          <span className="accent-text-gradient">Intelligent</span> Shopping,{' '}
          <span style={{ color: 'var(--text-primary)' }}>Personalized</span>
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--text-secondary)',
          maxWidth: '500px',
          margin: '0 auto 8px',
          lineHeight: '1.6',
        }}>
          AI-powered product suggestions tailored to your profile. Every recommendation is explainable, bounded, and gated.
        </p>
        {selectedCustomer && (
          <p style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginTop: '8px',
          }}>
            Shopping as <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
              {selectedCustomer.avatar} {selectedCustomer.name}
            </span> (Age {selectedCustomer.age})
          </p>
        )}
      </div>

      {/* DummyJSON Integration Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        marginBottom: '16px',
        borderRadius: '12px',
        background: 'rgba(217, 130, 43, 0.08)',
        border: '1px solid rgba(217, 130, 43, 0.25)',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span style={{ fontSize: '16px' }}>📦</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
            Catalog: {products.length} Products Live
          </span>
          <span style={{
            fontSize: '11px',
            background: 'var(--accent-glow)',
            color: 'var(--accent-primary)',
            padding: '2px 8px',
            borderRadius: '999px',
            fontWeight: '600'
          }}>
            DummyJSON API Connected
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSyncDummyJson}
            disabled={syncing}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            {syncing ? '⏳ Syncing...' : '🌐 Sync DummyJSON Products'}
          </button>
          <button
            onClick={handleResetDefault}
            disabled={syncing}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '8px',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: '250px', display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="🔍 Search products, categories, tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary">Search</button>
        </form>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: '500',
                border: '1px solid',
                borderColor: selectedCategory === cat ? 'var(--accent-primary)' : 'var(--border-primary)',
                background: selectedCategory === cat ? 'var(--accent-glow)' : 'transparent',
                color: selectedCategory === cat ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'capitalize',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Discount Banner */}
      <DiscountBanner products={products} />

      {/* Age-Based Dynamic Recommendations Spotlight */}
      {selectedCustomer && (
        <div className="glass-card animate-slide-up" style={{
          padding: '24px',
          marginBottom: '32px',
          border: '1px solid var(--accent-border)',
          background: 'linear-gradient(135deg, var(--bg-card), rgba(217, 130, 43, 0.08))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '28px' }}>{selectedCustomer.avatar}</span>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Tailored for {selectedCustomer.name} (Age {selectedCustomer.age})
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Category Focus: <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
                    {selectedCustomer.age < 30 ? 'Electronics, Gaming & Street Fashion' : selectedCustomer.age <= 45 ? 'Home, Ergonomics & Fitness' : 'Health, Orthopedic Comfort & Wellness'}
                  </span>
                </p>
              </div>
            </div>
            <span className="badge badge-accent">
              🎯 Real-Time Age Alignment
            </span>
          </div>

          {/* Age-Curated Products Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '16px',
          }}>
            {products
              .filter(p => {
                const ageCats = selectedCustomer.age < 30
                  ? ['electronics', 'gaming', 'fashion']
                  : selectedCustomer.age <= 45
                    ? ['home', 'health']
                    : ['health', 'home'];
                return ageCats.includes(p.category);
              })
              .slice(0, 4)
              .map(prod => (
                <div key={'curated_' + prod.id} style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    zIndex: 2,
                    background: 'rgba(15, 13, 11, 0.85)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '700',
                    color: 'var(--accent-primary)',
                    border: '1px solid var(--accent-border)',
                  }}>
                    🎯 Top Pick for Age {selectedCustomer.age}
                  </div>
                  <ProductCard product={prod} />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Main Catalog Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
          All Products {selectedCategory !== 'all' ? `(${selectedCategory})` : ''}
        </h2>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {filteredProducts.length} items available
        </span>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
          <p>Loading catalog...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
          <p>No products found matching your search</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: '20px',
        }}>
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Product Count */}
      <div style={{
        textAlign: 'center',
        marginTop: '32px',
        color: 'var(--text-muted)',
        fontSize: '13px',
      }}>
        Showing {filteredProducts.length} of {products.length} products
      </div>
    </div>
  );
}

export default Home;
