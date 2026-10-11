import { Link } from 'react-router-dom';
import { useApp } from '../context/appContext';
import ProductCard from '../components/ProductCard';
import { EmptyState, Loading } from '../components/ui';

function Wishlist() {
  const { wishlistProducts, productsLoading, addToCart } = useApp();

  if (productsLoading) return <div className="page"><Loading label="Loading your wishlist…" /></div>;

  const inStock = wishlistProducts.filter(p => p.stock > 0);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1>My Wishlist <span className="muted" style={{ fontWeight: 500, fontSize: 18 }}>({wishlistProducts.length})</span></h1>
          <p>Products you've saved for later</p>
        </div>
        {inStock.length > 0 && (
          <button className="btn btn-yellow" onClick={() => inStock.forEach(p => addToCart(p.id, 1, { silent: true }))}>
            Move all to cart
          </button>
        )}
      </div>

      {wishlistProducts.length === 0 ? (
        <div className="card">
          <EmptyState icon="♡" title="Your wishlist is empty" action={<Link to="/" className="btn btn-pink">Explore products</Link>}>
            Tap the heart on any product to save it here.
          </EmptyState>
        </div>
      ) : (
        <div className="grid-products">
          {wishlistProducts.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}

export default Wishlist;
