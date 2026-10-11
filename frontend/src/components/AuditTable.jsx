import { useState } from 'react';
import { formatDateTime, formatINR } from '../utils/format';
import { ACTION_LABELS } from '../utils/auditLabels';

const STATUS_BADGE = {
  success: 'badge-success',
  failed: 'badge-error',
  blocked: 'badge-warning',
  info: 'badge-info',
};

function AuditTable({ logs }) {
  const [expanded, setExpanded] = useState(null);

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">📋</div>
        <h2>No entries</h2>
        <p>Actions appear here as you shop, pay and change settings.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Reasoning</th>
            <th>Amount</th>
            <th>Customer</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => {
            const isOpen = expanded === log.id;
            const hasDetails = log.details && Object.keys(log.details).length > 0;
            return (
              <tr
                key={log.id}
                className={`clickable${isOpen ? ' expanded' : ''}`}
                onClick={() => setExpanded(isOpen ? null : log.id)}
                aria-expanded={isOpen}
              >
                <td className="small muted nowrap">{formatDateTime(log.timestamp)}</td>
                <td className="nowrap" style={{ fontWeight: 550 }}>{ACTION_LABELS[log.action] || log.action}</td>
                <td className={`cell-reason${isOpen ? '' : ' clamped'}`}>
                  {log.reasoning || '—'}
                  {isOpen && hasDetails && <pre className="details-pre mono">{JSON.stringify(log.details, null, 2)}</pre>}
                </td>
                <td className="nowrap accent" style={{ fontWeight: 600 }}>{log.amount ? formatINR(log.amount) : '—'}</td>
                <td className="secondary nowrap">{log.customer || '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[log.status] || 'badge-info'}`}>{log.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AuditTable;
