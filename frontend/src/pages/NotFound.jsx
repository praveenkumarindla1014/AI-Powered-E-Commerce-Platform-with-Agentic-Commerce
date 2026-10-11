import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

function NotFound() {
  return (
    <div className="page">
      <EmptyState icon="🧭" title="Page not found" action={<Link to="/" className="btn btn-primary">Back to the shop</Link>}>
        The page you're looking for doesn't exist.
      </EmptyState>
    </div>
  );
}

export default NotFound;
