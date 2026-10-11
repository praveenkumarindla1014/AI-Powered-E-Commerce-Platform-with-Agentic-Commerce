import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/appContext';
import {
  sendAssistantMessage, getAssistantMemory, forgetAssistantFact, clearAssistantMemory,
  payEmiInstallment, pinPay,
} from '../api';
import { PinForm, ProductImage } from './ui';
import { formatINR } from '../utils/format';

const QUICK_PROMPTS = [
  'What would suit me?',
  'Any offers under ₹2,000?',
  'Do I have any EMI due?',
  "What's in my cart?",
  'Pay for my cart',
  'What do you remember about me?',
];

const EMPTY_FACTS = { budget: null, interests: [], recipients: [] };

function welcome(name, returning) {
  return {
    id: 'welcome',
    role: 'assistant',
    text: returning
      ? `Welcome back, ${name}! I remember our earlier chats, so just pick up where you left off.`
      : `Hi ${name}! I'm your ShopMind assistant. Ask me for product ideas, a budget-friendly pick, your EMI status — or I can check out your cart for you. I'll remember your preferences for next time.`,
  };
}

function factCount(facts) {
  return (facts.budget ? 1 : 0) + facts.interests.length + facts.recipients.length;
}

function RecommendationList({ items }) {
  const { addToCart, findProduct } = useApp();
  return (
    <div className="stack-sm assistant-attachment">
      {items.map(item => {
        const product = findProduct(item.id);
        return (
          <div key={item.id} className="mini-product">
            <Link to={`/product/${item.id}`} className="thumb"><ProductImage image={item.image} name={item.name} size={22} /></Link>
            <div className="grow">
              <Link to={`/product/${item.id}`} className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</Link>
              <div className="price-row small">
                <strong>{formatINR(item.finalPrice)}</strong>
                {item.discountPercent > 0 && (
                  <>
                    <span className="strike">{formatINR(item.price)}</span>
                    <span className="off" style={{ fontSize: 12 }}>{item.discountPercent}% off</span>
                  </>
                )}
              </div>
            </div>
            <button className="btn btn-yellow btn-sm" disabled={!product || product.stock <= 0} onClick={() => addToCart(item.id)}>Add</button>
          </div>
        );
      })}
    </div>
  );
}

function PaymentCard({ payment, onPaid }) {
  const { customer, cart, cartTotal, recoveryLinkId, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const stale = !done && Math.round(cartTotal) !== Math.round(payment.amount);

  async function handlePay(pin, resetPin) {
    setBusy(true);
    setError(null);
    try {
      const data = await pinPay(customer.id, cart, pin, { channel: 'assistant', recoveryLinkId });
      setDone(true);
      onPaid(data.order);
    } catch (err) {
      setError(err.message);
      resetPin();
      if (err.status !== 401) showToast('error', 'Payment failed', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-tight card-accent assistant-attachment">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <strong>Pay {formatINR(payment.amount)}</strong>
        <span className="small muted">{payment.itemCount} item{payment.itemCount === 1 ? '' : 's'}</span>
      </div>
      <p className="small secondary" style={{ marginBottom: 10 }}>
        From UPI <strong>{payment.upiId}</strong>{payment.emi ? ` · or ${payment.emi.months} × ${formatINR(payment.emi.emiAmount)} EMI at checkout` : ''}
      </p>
      {done ? (
        <span className="badge badge-success">Paid</span>
      ) : stale ? (
        <p className="small" style={{ color: 'var(--warning)' }}>Your cart changed — ask me again to pay the new total.</p>
      ) : (
        <>
          <PinForm compact busy={busy} label="Approve payment" onSubmit={handlePay} />
          {error && <p className="small error-text" style={{ marginTop: 6 }}>{error}</p>}
          <Link to="/cart" className="small" style={{ display: 'inline-block', marginTop: 8 }}>Prefer card or netbanking? Open checkout →</Link>
        </>
      )}
    </div>
  );
}

function EmiCard({ emi, onPaid }) {
  const { customer } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handlePay(pin, resetPin) {
    setBusy(true);
    setError(null);
    try {
      const data = await payEmiInstallment(customer.id, emi.emiId, emi.installmentNumber, pin);
      setDone(true);
      onPaid(emi, data.plan);
    } catch (err) {
      setError(err.message);
      resetPin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-tight assistant-attachment" style={{ borderColor: emi.status === 'upcoming' ? undefined : '#F6C3C2' }}>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <strong className="small">{emi.productName}</strong>
        <span className={`badge ${emi.status === 'upcoming' ? 'badge-neutral' : 'badge-error'}`}>{emi.status}</span>
      </div>
      <p className="small secondary" style={{ marginBottom: 10 }}>
        Installment {emi.installmentNumber} of {emi.totalInstallments} · <strong>{formatINR(emi.amount)}</strong> · due {emi.dueDate}
      </p>
      {done ? (
        <span className="badge badge-success">Paid</span>
      ) : (
        <>
          <PinForm compact busy={busy} label={`Pay ${formatINR(emi.amount)}`} onSubmit={handlePay} />
          {error && <p className="small error-text" style={{ marginTop: 6 }}>{error}</p>}
        </>
      )}
    </div>
  );
}

/** Everything the assistant remembers, with a way to delete each fact. */
function MemoryPanel({ facts, onForget, onClear, clearing }) {
  const items = [
    ...(facts.budget ? [{ type: 'budget', value: null, label: `Budget ${formatINR(facts.budget)}` }] : []),
    ...facts.interests.map(i => ({ type: 'interest', value: i, label: i })),
    ...facts.recipients.map(r => ({ type: 'recipient', value: r, label: `Shops for ${r}` })),
  ];

  return (
    <div className="memory-panel">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <strong className="small">🧠 What I remember</strong>
        <button className="btn-link small" style={{ color: 'var(--error)' }} onClick={onClear} disabled={clearing}>
          {clearing ? 'Clearing…' : 'Clear chat & memory'}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="small muted">Nothing yet. Tell me your budget, what you like, or who you're shopping for and I'll remember it.</p>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          {items.map(item => (
            <span key={`${item.type}-${item.value}`} className={`memory-chip${item.type === 'interest' ? ' capitalize' : ''}`}>
              {item.label}
              <button onClick={() => onForget(item)} aria-label={`Forget ${item.label}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>Saved to your account and used only to personalise suggestions.</p>
    </div>
  );
}

function AIAssistant() {
  const { customer, cart, clearCart, reloadProducts, reloadCustomers, findProduct, showToast } = useApp();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [clearing, setClearing] = useState(false);
  // One conversation per persona, restored from the server's memory
  const [conversation, setConversation] = useState({ customerId: null, messages: [], facts: EMPTY_FACTS, loaded: false });
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const messageCounter = useRef(0);

  const customerId = customer?.id;
  const current = conversation.customerId === customerId ? conversation : null;
  const facts = current?.facts || EMPTY_FACTS;
  const messages = current?.messages || [];

  // The product on screen gives the assistant context ("is this good for running?")
  const productMatch = location.pathname.match(/^\/product\/([^/]+)/);
  const currentProduct = productMatch ? findProduct(decodeURIComponent(productMatch[1])) : null;

  const nextId = () => {
    messageCounter.current += 1;
    return `msg-${messageCounter.current}`;
  };

  const loadConversation = useCallback(async () => {
    if (!customer) return;
    const id = customer.id;
    try {
      const data = await getAssistantMemory(id);
      const restored = data.messages.map(m => ({ id: nextId(), role: m.role, text: m.text, recommendations: m.recommendations || [] }));
      const intro = welcome(customer.name, restored.length > 0);
      const divider = restored.length > 0 ? [{ id: 'history', role: 'divider', text: 'Earlier conversation' }] : [];
      setConversation({
        customerId: id,
        facts: data.facts,
        loaded: true,
        messages: [...divider, ...restored, ...(restored.length ? [{ id: 'now', role: 'divider', text: 'Today' }] : []), intro],
      });
    } catch {
      setConversation({ customerId: id, facts: EMPTY_FACTS, loaded: true, messages: [welcome(customer.name, false)] });
    }
  }, [customer]);

  // Load memory when the panel opens or the persona changes
  useEffect(() => {
    if (open && customerId && conversation.customerId !== customerId) loadConversation();
  }, [open, customerId, conversation.customerId, loadConversation]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function addMessages(...entries) {
    setConversation(prev => ({ ...prev, messages: [...prev.messages, ...entries.map(e => ({ id: nextId(), ...e }))] }));
  }

  async function send(text) {
    const message = text.trim();
    if (!message || !customer || sending) return;

    addMessages({ role: 'user', text: message });
    setInput('');
    setSending(true);
    try {
      const data = await sendAssistantMessage(customer.id, message, cart, currentProduct?.id);
      setConversation(prev => ({ ...prev, facts: data.facts || prev.facts }));
      addMessages(
        ...(data.learned?.length ? [{ role: 'learned', text: `Noted: ${data.learned.join(', ')}` }] : []),
        {
          role: 'assistant',
          text: data.reply,
          recommendations: data.recommendations || [],
          payment: data.payment || null,
          emi: data.emi || null,
        },
      );
    } catch (err) {
      addMessages({ role: 'assistant', text: `Sorry, I couldn't reach the store just now. ${err.message}` });
    } finally {
      setSending(false);
    }
  }

  async function handleForget(item) {
    try {
      const data = await forgetAssistantFact(customer.id, item.type, item.value);
      setConversation(prev => ({ ...prev, facts: data.facts }));
      showToast('info', 'Forgotten', `I won't use “${item.label}” anymore`, 2500);
    } catch (err) {
      showToast('error', 'Could not update memory', err.message);
    }
  }

  async function handleClear() {
    if (!window.confirm('Clear your chat history and everything the assistant remembers?')) return;
    setClearing(true);
    try {
      await clearAssistantMemory(customer.id);
      setConversation({ customerId: customer.id, facts: EMPTY_FACTS, loaded: true, messages: [welcome(customer.name, false)] });
      setShowMemory(false);
      showToast('success', 'Memory cleared', 'Starting a fresh conversation');
    } catch (err) {
      showToast('error', 'Could not clear memory', err.message);
    } finally {
      setClearing(false);
    }
  }

  function handleCartPaid(order) {
    clearCart();
    reloadProducts();
    reloadCustomers();
    showToast('success', 'Payment successful', `Order ${order.id} · ${formatINR(order.total)}`);
    addMessages({ role: 'assistant', text: `Done! ${formatINR(order.total)} was paid and your order ${order.id} is confirmed. You can track it on the Orders page.` });
  }

  function handleEmiPaid(emi, plan) {
    showToast('success', 'Installment paid', `${formatINR(emi.amount)} for ${emi.productName}`);
    addMessages({
      role: 'assistant',
      text: plan.nextDue
        ? `Installment ${emi.installmentNumber} is paid. Next up: ${formatINR(plan.nextDue.amount)} due on ${plan.nextDue.dueDate}.`
        : `Installment ${emi.installmentNumber} is paid — your ${emi.productName} plan is now fully cleared. 🎉`,
    });
  }

  if (!customer) return null;

  if (!open) {
    return (
      <button className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Open shopping assistant">
        <span aria-hidden="true">✦</span> <span className="launcher-text">Ask ShopMind AI</span>
      </button>
    );
  }

  const prompts = currentProduct ? ['Tell me about this product', ...QUICK_PROMPTS] : QUICK_PROMPTS;
  const remembered = factCount(facts);

  return (
    <section className="assistant-panel" aria-label="Shopping assistant">
      <header className="assistant-header">
        <span className="assistant-avatar" aria-hidden="true">✦</span>
        <div className="grow">
          <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>ShopMind Assistant</div>
          <div className="small">{customer.avatar} {customer.name} · {remembered > 0 ? `remembers ${remembered} thing${remembered === 1 ? '' : 's'} about you` : 'learns as you chat'}</div>
        </div>
        <button className={`assistant-header-btn${showMemory ? ' on' : ''}`} onClick={() => setShowMemory(v => !v)} aria-expanded={showMemory}>
          🧠 Memory
        </button>
        <button className="assistant-close" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
      </header>

      {showMemory && <MemoryPanel facts={facts} onForget={handleForget} onClear={handleClear} clearing={clearing} />}

      <div className="assistant-messages" aria-live="polite">
        {!current?.loaded && <div className="loading-block" style={{ padding: 30 }}><span className="spinner" /></div>}
        {messages.map(m => {
          if (m.role === 'divider') return <span key={m.id} className="history-divider">{m.text}</span>;
          if (m.role === 'learned') return <span key={m.id} className="learned-pill">🧠 {m.text}</span>;
          return (
            <div key={m.id} className="stack-sm" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>{m.text}</div>
              {m.recommendations?.length > 0 && <RecommendationList items={m.recommendations} />}
              {m.payment && <PaymentCard payment={m.payment} onPaid={handleCartPaid} />}
              {m.emi && <EmiCard emi={m.emi} onPaid={handleEmiPaid} />}
            </div>
          );
        })}
        {sending && <div className="bubble bubble-ai typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      <div className="assistant-prompts">
        {prompts.map(p => (
          <button key={p} className="chip" onClick={() => send(p)} disabled={sending}>{p}</button>
        ))}
      </div>

      {currentProduct && (
        <div className="small secondary" style={{ padding: '6px 14px 0', background: 'white' }}>
          👀 Looking at <strong>{currentProduct.name}</strong> — ask me about “this”
        </div>
      )}
      <form className="assistant-input" onSubmit={e => { e.preventDefault(); send(input); }}>
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about products, budgets, EMIs…"
          maxLength={500}
          aria-label="Message"
        />
        <button type="submit" className="btn btn-blue" disabled={sending || !input.trim()}>Send</button>
      </form>
    </section>
  );
}

export default AIAssistant;
