import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { openRecoveryLink } from '../api';
import { EmptyState, Loading } from '../components/ui';

/** Landing page for abandoned-cart recovery links: restores the saved cart. */
function Recover() {
  const { linkId } = useParams();
  const { replaceCart, selectCustomer, setRecoveryLinkId, showToast } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    openRecoveryLink(linkId)
      .then(({ cart }) => {
        if (cancelled) return;
        selectCustomer(cart.customerId);
        replaceCart(cart.cartItems);
        setRecoveryLinkId(cart.id);
        showToast('success', 'Cart restored', `Welcome back, ${cart.customerName}!`);
        navigate('/cart', { replace: true });
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [linkId, replaceCart, selectCustomer, setRecoveryLinkId, showToast, navigate]);

  return (
    <div className="page">
      {error ? (
        <EmptyState icon="⏳" title="This link can't be used" action={<Link to="/" className="btn btn-primary">Go to the shop</Link>}>
          {error}.
        </EmptyState>
      ) : (
        <Loading label="Restoring your saved cart…" />
      )}
    </div>
  );
}

export default Recover;
