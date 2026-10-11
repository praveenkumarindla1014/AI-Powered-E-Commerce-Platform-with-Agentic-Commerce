/**
 * Pricing — the single source of truth for what things cost.
 * The server always recomputes totals from the catalog; amounts sent by the
 * browser are never trusted.
 */

function hasDiscount(product) {
  return Boolean(product.discount_active) && Number(product.discount_percent) > 0;
}

/** Final per-unit price in whole rupees, after any active discount. */
function unitPrice(product) {
  if (!hasDiscount(product)) return product.price;
  return Math.round(product.price * (1 - product.discount_percent / 100));
}

/**
 * Price a cart against the catalog.
 * @param {Array<{id: string, quantity: number}>} items
 * @param {Array} catalog
 * @returns {{ lines, subtotal, discount, total, errors }}
 */
function priceCart(items, catalog) {
  const lines = [];
  const errors = [];

  (items || []).forEach(item => {
    const product = catalog.find(p => p.id === item.id);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));

    if (!product) {
      errors.push(`Product "${item.id}" no longer exists`);
      return;
    }
    if (product.stock < quantity) {
      errors.push(product.stock <= 0
        ? `"${product.name}" is out of stock`
        : `Only ${product.stock} of "${product.name}" left in stock`);
      return;
    }

    const unit = unitPrice(product);
    lines.push({
      id: product.id,
      name: product.name,
      image: product.image,
      quantity,
      price: product.price,
      unitPrice: unit,
      lineTotal: unit * quantity,
    });
  });

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  return { lines, subtotal, discount: subtotal - total, total, errors };
}

module.exports = { hasDiscount, unitPrice, priceCart };
