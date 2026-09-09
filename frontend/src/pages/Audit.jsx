import { useState, useEffect } from 'react';
import { getAuditLogs, clearAuditLogs } from '../api';
import AuditTable from '../components/AuditTable';

function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLogs();
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadLogs() {
    try {
      const data = await getAuditLogs();
      setLogs(data.logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm('Are you sure you want to clear all audit logs?')) return;
    try {
      await clearAuditLogs();
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  }

  const statusFilters = ['all', 'success', 'failed', 'blocked', 'info'];

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(l => l.status === filter);

  // Stats
  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    failed: logs.filter(l => l.status === 'failed').length,
    blocked: logs.filter(l => l.status === 'blocked').length,
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            letterSpacing: '-0.5px',
            marginBottom: '4px',
          }}>
            📋 Audit Trail
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Every AI decision, payment, and guardrail action is logged here
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={loadLogs} style={{ padding: '8px 16px' }}>
            🔄 Refresh
          </button>
          <button className="btn-danger" onClick={handleClear} style={{ padding: '8px 16px', fontSize: '13px' }}>
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px',
      }}>
        {[
          { label: 'Total Events', value: stats.total, icon: '📊', color: 'var(--text-primary)' },
          { label: 'Successful', value: stats.success, icon: '✅', color: 'var(--success)' },
          { label: 'Failed', value: stats.failed, icon: '❌', color: 'var(--error)' },
          { label: 'Blocked', value: stats.blocked, icon: '🚫', color: 'var(--warning)' },
        ].map(stat => (
          <div key={stat.label} className="glass-card" style={{
            padding: '20px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>{stat.icon}</span>
            <div style={{ fontSize: '28px', fontWeight: '700', color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border-primary)',
        paddingBottom: '12px',
      }}>
        {statusFilters.map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              fontWeight: '500',
              border: '1px solid',
              borderColor: filter === status ? 'var(--accent-primary)' : 'transparent',
              background: filter === status ? 'var(--accent-glow)' : 'transparent',
              color: filter === status ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textTransform: 'capitalize',
            }}
          >
            {status} {status !== 'all' && `(${logs.filter(l => l.status === status).length})`}
          </button>
        ))}
      </div>

      {/* Audit Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <p>Loading audit trail...</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <AuditTable logs={filteredLogs} />
        </div>
      )}

      <p style={{
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--text-muted)',
        marginTop: '16px',
      }}>
        Auto-refreshing every 5 seconds • {filteredLogs.length} entries shown
      </p>
    </div>
  );
}

export default Audit;
