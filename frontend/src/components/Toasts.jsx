import { useApp } from '../context/appContext';

const ICONS = { success: '✓', error: '✕', warning: '!', info: 'i', discount: '%' };

function Toasts() {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type === 'discount' ? 'info' : toast.type}`}>
          <span className={`badge badge-${toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : toast.type === 'success' ? 'success' : 'accent'}`}>
            {ICONS[toast.type] || 'i'}
          </span>
          <div className="grow">
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
          <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  );
}

export default Toasts;
