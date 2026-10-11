import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearAuditLogs, getAuditLogs } from '../api';
import { useApp } from '../context/appContext';
import AuditTable from '../components/AuditTable';
import { ACTION_LABELS } from '../utils/auditLabels';
import { Loading } from '../components/ui';

const STATUSES = ['all', 'success', 'failed', 'blocked', 'info'];
const PAGE_SIZE = 50;

function Audit() {
  const { showToast } = useApp();
  const [logs, setLogs] = useState(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getAuditLogs();
      setLogs(data.logs);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, autoRefresh]);

  async function handleClear() {
    if (!window.confirm('Clear the entire audit trail? This cannot be undone.')) return;
    try {
      await clearAuditLogs();
      setLogs([]);
      showToast('info', 'Audit trail cleared');
    } catch (err) {
      showToast('error', 'Could not clear', err.message);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (logs || []).filter(l =>
      (status === 'all' || l.status === status) &&
      (!q || [l.reasoning, l.customer, l.action, ACTION_LABELS[l.action]].some(v => v && String(v).toLowerCase().includes(q))));
  }, [logs, status, query]);

  if (logs === null && !error) return <div className="page"><Loading label="Loading audit trail…" /></div>;

  const count = s => (logs || []).filter(l => l.status === s).length;
  const stats = [
    { label: 'Total events', value: logs?.length || 0, color: 'var(--text-primary)' },
    { label: 'Successful', value: count('success'), color: 'var(--success)' },
    { label: 'Failed', value: count('failed'), color: 'var(--error)' },
    { label: 'Blocked by guardrails', value: count('blocked'), color: 'var(--warning)' },
  ];

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1>Audit trail</h1>
          <p>Every AI decision, guardrail check, payment and setting change — with the reasoning behind it.</p>
        </div>
        <div className="row">
          <label className="row small secondary" style={{ cursor: 'pointer' }}>
            <button className={`switch${autoRefresh ? ' on' : ''}`} onClick={() => setAutoRefresh(v => !v)} aria-label="Auto-refresh" aria-pressed={autoRefresh} />
            Live
          </label>
          <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
          <button className="btn btn-danger btn-sm" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {error && <div className="notice notice-error" style={{ marginBottom: 20 }}><div>{error}</div></div>}

      <div className="grid-4" style={{ marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} className="card stat-card">
            <div className="small muted">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="row wrap">
          {STATUSES.map(s => (
            <button key={s} className={`chip${status === s ? ' active' : ''}`} onClick={() => { setStatus(s); setLimit(PAGE_SIZE); }}>
              {s}{s !== 'all' ? ` (${count(s)})` : ''}
            </button>
          ))}
        </div>
        <div className="search-box" style={{ maxWidth: 320, marginLeft: 'auto' }}>
          <span className="search-box-icon" aria-hidden="true">⌕</span>
          <input className="input" type="search" placeholder="Search events, customers…" value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} aria-label="Search audit trail" />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <AuditTable logs={filtered.slice(0, limit)} />
      </div>

      <div className="row-between small muted" style={{ marginTop: 14 }}>
        <span>Showing {Math.min(limit, filtered.length)} of {filtered.length} · click a row for full details</span>
        {filtered.length > limit && <button className="btn btn-secondary btn-sm" onClick={() => setLimit(l => l + PAGE_SIZE)}>Show more</button>}
      </div>
    </div>
  );
}

export default Audit;
