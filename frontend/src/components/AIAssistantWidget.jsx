import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import { sendAssistantChat, verifyPayment, payEmiInstallment } from '../api';

function AIAssistantWidget() {
  const { selectedCustomer, addToCart, cart, cartTotal, clearCart, showToast } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [customerContext, setCustomerContext] = useState(null);
  const [approvingPayment, setApprovingPayment] = useState(false);
  const [emiPinInputs, setEmiPinInputs] = useState({});
  const [payingEmiId, setPayingEmiId] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize greeting when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      const ageGroup = selectedCustomer.age < 30
        ? 'under 30 (Tech, Gaming & Trendy)'
        : selectedCustomer.age <= 45
          ? '30-45 (Home, Fitness & WFH)'
          : '45+ (Health, Comfort & Wellness)';

      const welcomeMessage = {
        sender: 'ai',
        text: `Hi ${selectedCustomer.name}! I'm your ShopMind Shopping & Payment Agent. I can recommend items for your age bracket (${ageGroup}), check pending EMI installments, or generate mobile-synced payment links. How can I help?`,
        recommendations: [],
      };
      setMessages([welcomeMessage]);
      loadInitialContext();
    }
  }, [selectedCustomer?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function loadInitialContext() {
    if (!selectedCustomer) return;
    try {
      const data = await sendAssistantChat(selectedCustomer.id, 'summary', cart, cartTotal);
      if (data.success && data.customerContext) {
        setCustomerContext(data.customerContext);
      }
    } catch (err) {
      console.error('Initial context error:', err);
    }
  }

  async function handleSend(textToSend) {
    const text = textToSend || inputMessage;
    if (!text.trim() || !selectedCustomer) return;

    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setLoading(true);

    try {
      const data = await sendAssistantChat(selectedCustomer.id, text, cart, cartTotal);
      if (data.success) {
        setCustomerContext(data.customerContext);
        const aiMsg = {
          sender: 'ai',
          text: data.reply,
          recommendations: data.recommendations || [],
          paymentDetails: data.paymentDetails || null,
          pendingEmiDetails: data.pendingEmiDetails || null,
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        setMessages(prev => [...prev, { sender: 'ai', text: 'Sorry, I had trouble processing that request. Please try again.', recommendations: [] }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: `Error: ${err.message}`, recommendations: [] }]);
    } finally {
      setLoading(false);
    }
  }

  const [agentPasswordInputs, setAgentPasswordInputs] = useState({});

  async function handleApproveAgentPayment(paymentDetails, isSimulatingFail = false) {
    const enteredPassword = agentPasswordInputs[paymentDetails.paymentLink] ?? '1234';

    if (!isSimulatingFail && enteredPassword !== '1234' && enteredPassword !== 'password') {
      showToast('error', 'Security Verification Failed', 'Invalid security PIN / password. Transaction blocked.');
      return;
    }

    setApprovingPayment(true);
    try {
      if (isSimulatingFail) {
        // Simulate payment failure condition (insufficient bank balance / card decline)
        showToast('error', 'Payment Failed', 'Bank declined transaction: Insufficient funds or invalid authorization. No money was deducted.');
        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: `❌ Payment Failed for ₹${Math.round(paymentDetails.amount).toLocaleString()}.\n\nCondition: Bank declined transaction due to insufficient balance on linked account. No money was deducted.\n\nYou can retry or switch payment methods.`,
            recommendations: [],
          }
        ]);
        return;
      }

      const mockOrderId = 'order_agent_' + Date.now();
      const mockPaymentId = 'pay_agent_' + Date.now();

      await verifyPayment(
        mockOrderId,
        mockPaymentId,
        'mock_valid_signature',
        paymentDetails.amount,
        selectedCustomer?.id
      );

      showToast('success', 'Mobile Payment Approved! 🎉', `₹${Math.round(paymentDetails.amount).toLocaleString()} authorized via ${paymentDetails.phone}`);
      clearCart();

      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `✅ Payment of ₹${Math.round(paymentDetails.amount).toLocaleString()} confirmed successfully! Authorization verified with phone (${paymentDetails.phone}) and security PIN. Your order receipt has been generated.`,
          recommendations: [],
        }
      ]);
    } catch (err) {
      showToast('error', 'Payment Authorization Failed', err.message);
    } finally {
      setApprovingPayment(false);
    }
  }

  async function handlePayEmi(emiDetails) {
    const enteredPin = emiPinInputs[emiDetails.emiId] || '1234';
    setPayingEmiId(emiDetails.emiId);

    try {
      const result = await payEmiInstallment(
        selectedCustomer.id,
        emiDetails.emiId,
        emiDetails.installmentNumber,
        enteredPin
      );

      showToast('success', 'EMI Paid Successfully! 🎉', `Installment #${emiDetails.installmentNumber} (₹${emiDetails.amount.toLocaleString()}) paid via Razorpay Bank Mandate`);

      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `✅ EMI Installment #${emiDetails.installmentNumber} of ₹${emiDetails.amount.toLocaleString()} for "${emiDetails.productName}" paid successfully! Verified with mobile sync (${emiDetails.phone}) and security PIN. Status updated to: PAID.`,
          recommendations: [],
        }
      ]);
    } catch (err) {
      showToast('error', 'Security Verification Failed', err.message);
    } finally {
      setPayingEmiId(null);
    }
  }

  const quickPrompts = [
    '📊 Any Payment Pending? (EMI)',
    '💳 Make Payment & Send Link',
    '💡 What fits my age group?',
    '🏷️ Any active offers in my budget?',
    '💰 Suggest items under ₹1,000',
  ];

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="btn-primary"
          style={{
            borderRadius: '999px',
            padding: '12px 20px',
            boxShadow: '0 8px 30px rgba(217, 130, 43, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            border: '1px solid var(--accent-border)',
            animation: 'pulse-glow 2.5s infinite',
          }}
        >
          <span style={{ fontSize: '20px' }}>🧠</span>
          <span style={{ fontWeight: '700' }}>Ask AI Assistant</span>
          {selectedCustomer && (
            <span style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '11px',
              color: 'var(--text-primary)',
            }}>
              {selectedCustomer.avatar} {selectedCustomer.name}
            </span>
          )}
        </button>
      )}

      {/* Expanded Chat Window */}
      {isOpen && (
        <div style={{
          width: '420px',
          height: '570px',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--accent-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideInUp 0.3s ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, var(--bg-tertiary), rgba(217, 130, 43, 0.15))',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--accent-glow)',
                border: '1px solid var(--accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}>
                🧠
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  ShopMind AI Assistant
                </div>
                <div style={{ fontSize: '11px', color: 'var(--accent-primary)' }}>
                  {selectedCustomer ? `${selectedCustomer.avatar} ${selectedCustomer.name} (${selectedCustomer.age}y) • ${selectedCustomer.phone || '+91 98765 34562'}` : 'Personalized Agent'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Context Banner: Age Category & Past Price Band */}
          {customerContext && (
            <div style={{
              padding: '8px 16px',
              background: 'var(--bg-primary)',
              borderBottom: '1px solid var(--border-primary)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>🎯 <strong>Age Bracket:</strong> {customerContext.ageGroupLabel || `${selectedCustomer.age}y group`}</span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
                {customerContext.typicalPriceBand || 'Active Sync'}
              </span>
            </div>
          )}

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  background: msg.sender === 'user'
                    ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                    : 'var(--bg-tertiary)',
                  color: msg.sender === 'user' ? '#0F0D0B' : 'var(--text-primary)',
                  fontWeight: msg.sender === 'user' ? '600' : '400',
                  border: msg.sender === 'user' ? 'none' : '1px solid var(--border-primary)',
                }}>
                  {msg.text}
                </div>

                {/* FEATURE: Pending EMI Settlement Card with Security PIN */}
                {msg.pendingEmiDetails && (
                  <div className="animate-slide-up" style={{
                    marginTop: '10px',
                    padding: '14px',
                    background: 'linear-gradient(135deg, rgba(231, 76, 60, 0.12), rgba(217, 130, 43, 0.1))',
                    border: '1px solid rgba(231, 76, 60, 0.3)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#E74C3C' }}>
                        ⚠️ Pending EMI Detected
                      </span>
                      <span className="badge badge-error" style={{ fontSize: '10px' }}>
                        Due: {msg.pendingEmiDetails.dueDate}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>📦 <strong>Product:</strong> {msg.pendingEmiDetails.productName}</div>
                      <div>📊 <strong>Installment:</strong> #{msg.pendingEmiDetails.installmentNumber} of 3</div>
                      <div>💰 <strong>Due Amount:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: '700' }}>₹{msg.pendingEmiDetails.amount.toLocaleString()}</span></div>
                      <div>📱 <strong>Linked Mobile:</strong> {msg.pendingEmiDetails.phone}</div>
                      <div>⚡ <strong>UPI ID:</strong> {msg.pendingEmiDetails.upiId}</div>
                    </div>

                    <div style={{
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span>📲</span>
                      <span>Bank mandate push notification synced to {msg.pendingEmiDetails.phone}. Enter security PIN to approve.</span>
                    </div>

                    {/* Password / PIN Verification Box */}
                    <div style={{ background: 'var(--bg-primary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Enter 4-Digit Security PIN / Password (Default: 1234)
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="password"
                          className="input-field"
                          maxLength="6"
                          value={emiPinInputs[msg.pendingEmiDetails.emiId] ?? '1234'}
                          onChange={(e) => setEmiPinInputs({ ...emiPinInputs, [msg.pendingEmiDetails.emiId]: e.target.value })}
                          placeholder="PIN"
                          style={{ width: '90px', textAlign: 'center', letterSpacing: '4px', fontSize: '14px', padding: '6px' }}
                        />
                        <button
                          className="btn-primary"
                          onClick={() => handlePayEmi(msg.pendingEmiDetails)}
                          disabled={payingEmiId === msg.pendingEmiDetails.emiId}
                          style={{
                            flex: 1,
                            justifyContent: 'center',
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: '700',
                          }}
                        >
                          {payingEmiId === msg.pendingEmiDetails.emiId ? '⏳ Authorizing...' : '🔐 Verify & Pay EMI'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Agent Payment Link & Mobile Approval Card */}
                {msg.paymentDetails && (
                  <div className="animate-slide-up" style={{
                    marginTop: '10px',
                    padding: '14px',
                    background: 'linear-gradient(135deg, rgba(217, 130, 43, 0.12), rgba(46, 204, 113, 0.08))',
                    border: '1px solid var(--accent-border)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                        💳 Agent Payment Link Dispatched
                      </span>
                      <span className="badge badge-success" style={{ fontSize: '10px' }}>
                        Live Synced
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>📱 <strong>Mobile Number:</strong> {msg.paymentDetails.phone}</div>
                      <div>⚡ <strong>UPI ID:</strong> {msg.paymentDetails.upiId}</div>
                      <div>💰 <strong>Total Amount:</strong> ₹{Math.round(msg.paymentDetails.amount).toLocaleString()}</div>
                      {msg.paymentDetails.qualifiesEmi && (
                        <div style={{ color: 'var(--accent-primary)' }}>
                          📊 <strong>EMI Option:</strong> 3 monthly payments of ₹{msg.paymentDetails.emiSplit?.toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div style={{
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span>🔒</span>
                      <span>{msg.paymentDetails.securityPrompt}</span>
                    </div>

                    {/* Password Verification for Payment */}
                    <div style={{ background: 'var(--bg-primary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Security Verification Password / PIN (Default: 1234)
                      </label>
                      <input
                        type="password"
                        className="input-field"
                        maxLength="8"
                        value={agentPasswordInputs[msg.paymentDetails.paymentLink] ?? '1234'}
                        onChange={(e) => setAgentPasswordInputs({ ...agentPasswordInputs, [msg.paymentDetails.paymentLink]: e.target.value })}
                        placeholder="PIN"
                        style={{ width: '100%', fontSize: '13px', padding: '6px 10px', letterSpacing: '3px', marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-primary"
                          onClick={() => handleApproveAgentPayment(msg.paymentDetails, false)}
                          disabled={approvingPayment}
                          style={{
                            flex: 1,
                            justifyContent: 'center',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: '700',
                          }}
                        >
                          {approvingPayment ? '⏳ Authorizing...' : '✓ Authorize & Pay'}
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleApproveAgentPayment(msg.paymentDetails, true)}
                          disabled={approvingPayment}
                          style={{
                            padding: '8px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🧪 Decline Test
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <a
                        href={msg.paymentDetails.paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '11px',
                          color: 'var(--accent-primary)',
                          textDecoration: 'underline',
                        }}
                      >
                        🔗 Open Direct Hosted Payment Link ({msg.paymentDetails.paymentLink.replace('https://', '')})
                      </a>
                    </div>
                  </div>
                )}

                {/* Recommended Product Cards inside Chat */}
                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {msg.recommendations.map(prod => (
                      <div
                        key={prod.id}
                        style={{
                          background: 'var(--bg-primary)',
                          border: `1px solid ${prod.discountActive ? 'var(--accent-border)' : 'var(--border-primary)'}`,
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <span style={{ fontSize: '26px' }}>{prod.image}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {prod.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                              ₹{prod.finalPrice.toLocaleString()}
                            </span>
                            {prod.discountActive && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                                ₹{prod.originalPrice.toLocaleString()}
                              </span>
                            )}
                            {prod.discountActive && (
                              <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                {prod.discountPercent}% OFF
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.2' }}>
                            {prod.reason}
                          </div>
                        </div>
                        <button
                          className="btn-primary"
                          onClick={() => {
                            addToCart({ id: prod.id, name: prod.name, price: prod.originalPrice, image: prod.image, discount_active: prod.discountActive, discount_percent: prod.discountPercent });
                            showToast('success', 'Added to Cart', `${prod.name} added to your cart`);
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            flexShrink: 0,
                          }}
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '8px 14px',
                borderRadius: '12px',
                background: 'var(--bg-tertiary)',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}>
                🧠 Assistant checking phone records & payment status...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border-primary)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
          }}>
            {quickPrompts.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.color = 'var(--accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              type="text"
              className="input-field"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask: 'any payment pending?' or 'make payment'..."
              style={{ fontSize: '12px', padding: '8px 12px' }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !inputMessage.trim()}
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default AIAssistantWidget;
