/**
 * EMI records — installments are stored as "paid" or "upcoming"; whether an
 * unpaid installment is due or overdue is derived from today's date so the
 * data never goes stale.
 */
const store = require('./store');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function withEffectiveStatus(installment) {
  if (installment.status === 'paid') return { ...installment };
  const date = today();
  let status = 'upcoming';
  if (installment.dueDate < date) status = 'overdue';
  else if (installment.dueDate === date) status = 'due';
  return { ...installment, status };
}

function summarize(record) {
  const installments = record.installments.map(withEffectiveStatus);
  const unpaid = installments.filter(i => i.status !== 'paid');
  return {
    id: record.id,
    productName: record.productName,
    totalAmount: record.totalAmount,
    totalInstallments: record.totalInstallments,
    phone: record.phone,
    installments,
    paidCount: installments.length - unpaid.length,
    nextDue: unpaid[0] || null,
    outstanding: unpaid.reduce((sum, i) => sum + i.amount, 0),
    hasOverdue: unpaid.some(i => i.status === 'overdue' || i.status === 'due'),
  };
}

function customerEmis(customerId) {
  return store.read('emi_records').filter(r => r.customerId === customerId).map(summarize);
}

/**
 * Pay the next unpaid installment of a plan. Installments must be paid in order.
 * @returns {{ ok: boolean, error?: string, installment?, record? }}
 */
function payInstallment(customerId, emiId, installmentNumber) {
  const records = store.read('emi_records');
  const record = records.find(r => r.id === emiId && r.customerId === customerId);
  if (!record) return { ok: false, status: 404, error: 'EMI plan not found for this customer' };

  const installment = record.installments.find(i => i.installmentNumber === Number(installmentNumber));
  if (!installment) return { ok: false, status: 404, error: `Installment #${installmentNumber} not found` };
  if (installment.status === 'paid') return { ok: false, status: 409, error: `Installment #${installmentNumber} is already paid` };

  const next = record.installments.find(i => i.status !== 'paid');
  if (next.installmentNumber !== installment.installmentNumber) {
    return { ok: false, status: 409, error: `Please pay installment #${next.installmentNumber} first` };
  }

  installment.status = 'paid';
  installment.paidAt = new Date().toISOString();
  store.write('emi_records', records);
  return { ok: true, installment, record: summarize(record) };
}

module.exports = { customerEmis, payInstallment };
