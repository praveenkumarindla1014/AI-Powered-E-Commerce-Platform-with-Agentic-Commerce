import { Link } from 'react-router-dom';
import { hasDiscount } from '../utils/format';

function DealsStrip({ products }) {
  const deals = products.filter(p => hasDiscount(p) && p.stock > 0).sort((a, b) => b.discount_percent - a.discount_percent);
  if (deals.length === 0) return null;

  return (
    <div className="promo-strip">
      <strong>🔥 {deals.length} deals live</strong>
      <div className="promo-strip-items">
        {deals.map(p => (
          <Link key={p.id} to={`/product/${p.id}`}>
            <b>{p.discount_percent}% off</b> {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default DealsStrip;
