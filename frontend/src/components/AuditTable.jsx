function AuditTable({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: 'var(--text-muted)',
      }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>📋</span>
        <p style={{ fontSize: '16px', fontWeight: '500' }}>No audit entries yet</p>
        <p style={{ fontSize: '13px', marginTop: '8px' }}>Actions will appear here as you interact with the app</p>
      </div>
    );
  }

  const statusConfig = {
    success: { badge: 'badge-success', icon: '✅' },
    failed: { badge: 'badge-error', icon: '❌' },
    blocked: { badge: 'badge-warning', icon: '🚫' },
    info: { badge: 'badge-info', icon: 'ℹ️' },
  };

  const actionLabels = {
    suggestion_generated: '🧠 Suggestion Generated',
    suggestion_blocked: '🚫 Suggestion Blocked',
    suggestion_accepted: '✅ Suggestion Accepted',
    suggestion_dismissed: '👋 Suggestion Dismissed',
    suggestion_failed: '❌ Suggestion Failed',
    suggestion_error: '⚠️ Suggestion Error',
    search_logged: '🔍 Search Logged',
    discount_applied: '🎉 Discount Applied',
    order_created: '📦 Order Created',
    order_failed: '❌ Order Failed',
    payment_success: '💳 Payment Success',
    payment_failed: '💳 Payment Failed',
    payment_failure_simulated: '🧪 Failure Simulated',
    payment_error: '⚠️ Payment Error',
    simulation_error: '⚠️ Simulation Error',
    cart_recovery: '⏰ Cart Recovery Link',
    payment_method_reorder: '💳 Method Reordered',
    emi_suggestion: '📊 EMI Suggested',
    assistant_query: '🤖 AI Assistant Query',
    agent_payment_link: '📱 Agent Payment Link Dispatched',
    emi_inquiry: '📊 Pending EMI Checked',
    emi_installment_paid: '✅ EMI Installment Paid',
    emi_pin_failed: '🔒 EMI Security PIN Rejected',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0 4px',
      }}>
        <thead>
          <tr>
            {['Timestamp', 'Action', 'Reasoning', 'Amount', 'Customer', 'Status'].map(header => (
              <th key={header} style={{
                textAlign: 'left',
                padding: '12px 16px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--border-primary)',
              }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => {
            const config = statusConfig[log.status] || statusConfig.info;
            return (
              <tr
                key={log.id}
                className="stagger-item"
                style={{
                  background: index % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'var(--bg-secondary)' : 'transparent'}
              >
                <td style={{
                  padding: '12px 16px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                }}>
                  {new Date(log.timestamp).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                }}>
                  {actionLabels[log.action] || log.action}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  maxWidth: '300px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {log.reasoning || '—'}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--accent-primary)',
                }}>
                  {log.amount ? `₹${Number(log.amount).toLocaleString()}` : '—'}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}>
                  {log.customer || '—'}
                </td>
                <td style={{
                  padding: '12px 16px',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                }}>
                  <span className={`badge ${config.badge}`}>
                    {config.icon} {log.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AuditTable;
