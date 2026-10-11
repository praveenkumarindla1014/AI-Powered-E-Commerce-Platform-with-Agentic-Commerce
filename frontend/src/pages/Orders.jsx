import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { getEmis, getOrders, payEmiInstallment } from '../api';
import { EmptyState, Loading, PinForm, ProductImage } from '../components/ui';
import { formatDate, formatDateTime, formatINR } from '../utils/format';

const ORDER_STATUS = {
  paid: { label: 'Paid', badge: 'badge-success' },
  failed: { label: 'Payment failed', badge: 'badge-error' },
  created: { label: 'Not completed', badge: 'badge-neutral' },
};

const INSTALLMENT_STATUS = {
  paid: 'badge-success',
  overdue: 'badge-error',
  due: 'badge-warning',
  upcoming: 'badge-neutral',
};

function EmiPlan({ plan, customer, onPaid }) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useApp();
  const next = plan.nextDue;

  async function handlePay(pin, resetPin) {
    setPaying(true);
    setError(null);
    try {
      await payEmiInstallment(customer.id, plan.id, next.installmentNumber, pin);
      showToast('success', 'Installment paid', `${formatINR(next.amount)} for ${plan.productName}`);
      onPaid();
    } catch (err) {
      setError(err.message);
      resetPin();
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="card">
      <div className="row-between wrap" style={{ marginBottom: 12 }}>
        <div>
          <h3>{plan.productName}</h3>
          <p className="small muted">{formatINR(plan.totalAmount)} over {plan.totalInstallments} months · {plan.paidCount} of {plan.totalInstallments} paid</p>
        </div>
        {next
          ? <span className={`badge ${plan.hasOverdue ? 'badge-error' : 'badge-neutral'}`}>{formatINR(plan.outstanding)} outstanding</span>
          : <span className="badge badge-success">Fully paid</span>}
      </div>

      <div className="stack-sm" style={{ marginBottom: next ? 14 : 0 }}>
        {plan.installments.map(inst => (
          <div key={inst.installmentNumber} className="row-between small">
            <span>Installment {inst.installmentNumber} · due {formatDate(inst.dueDate)}</span>
            <span className="row">
              <span>{formatINR(inst.amount)}</span>
              <span className={`badge ${INSTALLMENT_STATUS[inst.status]}`}>{inst.status}</span>
            </span>
          </div>
        ))}
      </div>

      {next && (
        <div className="stack-sm">
          <span className="small secondary">Pay installment {next.installmentNumber} ({formatINR(next.amount)}) from your UPI mandate:</span>
          <PinForm busy={paying} compact label={`Pay ${formatINR(next.amount)}`} onSubmit={handlePay} />
          {error && <span className="small error-text">{error}</span>}
        </div>
      )}
    </div>
  );
}

function Orders() {
  const { customer } = useApp();
  const [params] = useSearchParams();
  const placedId = params.get('placed');
  const [orders, setOrders] = useState(null);
  const [emis, setEmis] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!customer) return;
    try {
      const [orderData, emiData] = await Promise.all([getOrders(customer.id), getEmis(customer.id)]);
      setOrders(orderData.orders);
      setEmis(emiData.emis);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [customer]);

  useEffect(() => {
    setOrders(null);
    load();
  }, [load]);

  if (!customer || (orders === null && !error)) return <div className="page"><Loading label="Loading your orders…" /></div>;

  const visibleOrders = (orders || []).filter(o => o.status !== 'created');
  const placed = placedId && orders?.find(o => o.id === placedId);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1>Orders & payments</h1>
          <p>Order history and EMI plans for {customer.avatar} {customer.name}</p>
        </div>
      </div>

      {error && <div className="notice notice-error" style={{ marginBottom: 20 }}><div>{error}</div></div>}

      {placed?.status === 'paid' && (
        <div className="notice notice-success fade-in" style={{ marginBottom: 24 }}>
          <div>
            <div className="notice-title">Thank you! Your order is confirmed.</div>
            Order <span className="mono">{placed.id}</span> · {formatINR(placed.total)} paid{placed.method ? ` via ${placed.method}` : ''}.
          </div>
        </div>
      )}

      {emis.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div className="section-title"><h2>EMI plans</h2></div>
          <div className="grid-2">
            {emis.map(plan => <EmiPlan key={plan.id} plan={plan} customer={customer} onPaid={load} />)}
          </div>
        </section>
      )}

      <section>
        <div className="section-title">
          <h2>Orders</h2>
          <span className="small muted">{visibleOrders.length} order{visibleOrders.length === 1 ? '' : 's'}</span>
        </div>

        {visibleOrders.length === 0 ? (
          <div className="card">
            <EmptyState icon="📦" title="No orders yet" action={<Link to="/" className="btn btn-primary">Start shopping</Link>}>
              Orders you place as {customer.name} will appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="stack">
            {visibleOrders.map(order => {
              const status = ORDER_STATUS[order.status] || ORDER_STATUS.created;
              return (
                <div key={order.id} className="card" style={order.id === placedId ? { borderColor: 'var(--success)' } : undefined}>
                  <div className="row-between wrap" style={{ marginBottom: 12 }}>
                    <div>
                      <span className="mono small secondary">{order.id}</span>
                      <p className="small muted">{formatDateTime(order.paidAt || order.createdAt)}{order.method ? ` · ${order.method}` : ''}{order.simulation ? ' · failure simulation' : ''}</p>
                    </div>
                    <div className="row">
                      <strong style={{ fontSize: 16 }}>{formatINR(order.total)}</strong>
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 14 }}>
                    {order.items.map(item => (
                      <div key={item.id} className="row" style={{ gap: 10 }}>
                        <div className="thumb" style={{ width: 40, height: 40 }}><ProductImage image={item.image} name={item.name} size={20} /></div>
                        <span className="small">{item.quantity} × {item.name}</span>
                      </div>
                    ))}
                  </div>
                  {order.status === 'failed' && order.failureReason && (
                    <p className="small error-text" style={{ marginTop: 10 }}>No money was charged — {order.failureReason}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Orders;
