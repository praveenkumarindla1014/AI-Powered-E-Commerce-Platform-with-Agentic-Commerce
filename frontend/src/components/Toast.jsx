function Toast({ toasts, onRemove }) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: '🔔',
    discount: '🎉',
  };

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type === 'discount' ? 'info' : toast.type}`}
        >
          <span className="toast-icon">{icons[toast.type] || '🔔'}</span>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => onRemove(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
