const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { logAudit } = require('../services/auditLogger');

const USD_TO_INR = 85;

// GET /api/products — List all catalog products
router.get('/', (req, res) => {
  res.json({ success: true, products: store.read('products') });
});

// POST /api/products/sync-dummyjson — Import extra products from the DummyJSON API
router.post('/sync-dummyjson', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  try {
    const response = await fetch(`https://dummyjson.com/products?limit=${limit}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`DummyJSON responded with HTTP ${response.status}`);
    const data = await response.json();

    const imported = data.products.map(p => {
      const discountPct = Math.round(p.discountPercentage || 0);
      return {
        id: `dj_${p.id}`,
        name: p.title,
        category: p.category,
        price: Math.max(299, Math.round(p.price * USD_TO_INR)),
        stock: p.stock ?? 20,
        tags: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : [p.category],
        description: p.description,
        discount_percent: discountPct,
        discount_active: discountPct > 8,
        image: p.thumbnail || p.images?.[0] || '📦',
        brand: p.brand || null,
        rating: p.rating ?? null,
      };
    });

    // Keep curated products, add or refresh the imported ones
    const byId = new Map(store.read('products').map(p => [p.id, p]));
    imported.forEach(p => byId.set(p.id, p));
    const merged = [...byId.values()];
    store.write('products', merged);

    logAudit('catalog_synced', {
      status: 'success',
      reasoning: `Imported ${imported.length} products from DummyJSON. Catalog now has ${merged.length} products.`,
    });

    res.json({
      success: true,
      message: `Imported ${imported.length} products from DummyJSON`,
      totalProducts: merged.length,
      products: merged,
    });
  } catch (error) {
    console.error('DummyJSON sync error:', error.message);
    res.status(502).json({ success: false, error: `Could not reach DummyJSON: ${error.message}` });
  }
});

// POST /api/products/reset — Restore the original curated catalog (prices, stock, discounts)
router.post('/reset', (req, res) => {
  store.reset('products');
  logAudit('catalog_reset', { status: 'info', reasoning: 'Catalog restored to the curated default products' });
  res.json({ success: true, message: 'Catalog restored to default', products: store.read('products') });
});

// PATCH /api/products/:id/discount — Change a product's discount
router.patch('/:id/discount', (req, res) => {
  const products = store.read('products');
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

  const { discount_active, discount_percent } = req.body;

  if (discount_percent !== undefined) {
    const pct = Number(discount_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
      return res.status(400).json({ success: false, error: 'Discount must be between 0 and 90%' });
    }
    product.discount_percent = Math.round(pct);
  }
  if (discount_active !== undefined) product.discount_active = Boolean(discount_active);

  store.write('products', products);

  logAudit(product.discount_active ? 'discount_applied' : 'discount_removed', {
    status: 'info',
    amount: product.price,
    reasoning: product.discount_active
      ? `${product.discount_percent}% discount active on "${product.name}"`
      : `Discount turned off for "${product.name}"`,
    details: { productId: product.id, discount_percent: product.discount_percent },
  });

  res.json({ success: true, product });
});

// GET /api/products/:id — Single product
router.get('/:id', (req, res) => {
  const product = store.read('products').find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json({ success: true, product });
});

module.exports = router;
