const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const DEFAULT_PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products_default.json');

function readProducts() {
  const data = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
  return JSON.parse(data);
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// GET /api/products — List all catalog products
router.get('/', (req, res) => {
  try {
    const products = readProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products/sync-dummyjson — Fetch and sync products from DummyJSON API
router.post('/sync-dummyjson', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 45;
    const response = await fetch(`https://dummyjson.com/products?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch DummyJSON: HTTP ${response.status}`);
    }
    const data = await response.json();

    const dummyProducts = data.products.map(p => {
      const discountPct = Math.round(p.discountPercentage || 0);
      // Realistic INR price: price in USD * 85
      const inrPrice = Math.max(299, Math.round(p.price * 85));

      return {
        id: `dj_${p.id}`,
        name: p.title,
        category: p.category,
        price: inrPrice,
        stock: p.stock || 20,
        tags: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : [p.category, p.brand || 'lifestyle'],
        description: p.description,
        discount_percent: discountPct,
        discount_active: discountPct > 8,
        image: p.thumbnail || (p.images && p.images[0]) || '📦',
        brand: p.brand || 'ShopMind Select',
        rating: p.rating || 4.5
      };
    });

    // Merge or replace: keep original products, append/update DummyJSON items
    const existing = readProducts();
    const existingMap = new Map();
    existing.forEach(p => existingMap.set(p.id, p));

    dummyProducts.forEach(dp => {
      existingMap.set(dp.id, dp);
    });

    const merged = Array.from(existingMap.values());
    writeProducts(merged);

    res.json({
      success: true,
      message: `Successfully synced ${dummyProducts.length} products from DummyJSON!`,
      totalProducts: merged.length,
      syncedCount: dummyProducts.length,
      products: merged
    });
  } catch (error) {
    console.error('DummyJSON sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products/reset-default — Restore original curated product catalog
router.post('/reset-default', (req, res) => {
  try {
    if (fs.existsSync(DEFAULT_PRODUCTS_FILE)) {
      const defaultData = fs.readFileSync(DEFAULT_PRODUCTS_FILE, 'utf-8');
      fs.writeFileSync(PRODUCTS_FILE, defaultData);
      const products = JSON.parse(defaultData);
      return res.json({ success: true, message: 'Catalog reset to original state', products });
    }
    res.json({ success: true, message: 'Default catalog already active', products: readProducts() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/discounts — View discount info for all products
router.get('/discounts', (req, res) => {
  try {
    const products = readProducts();
    const discounts = products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      discount_percent: p.discount_percent,
      discount_active: p.discount_active
    }));
    res.json({ success: true, discounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/discounts — Toggle discount on a product
router.post('/discounts', (req, res) => {
  try {
    const { productId, discount_active, discount_percent } = req.body;
    const products = readProducts();
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (discount_active !== undefined) product.discount_active = discount_active;
    if (discount_percent !== undefined) product.discount_percent = Number(discount_percent);

    writeProducts(products);
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
