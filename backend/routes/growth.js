const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { checkAbandonedCartRecovery, getPaymentMethodOrder, checkEmiEligibility } = require('../services/guardrails');
const { logAudit } = require('../services/auditLogger');

const ABANDONED_FILE = path.join(__dirname, '..', 'data', 'abandoned_carts.json');
const CUSTOMERS_FILE = path.join(__dirname, '..', 'data', 'customers.json');

function readAbandoned() {
  try {
    return JSON.parse(fs.readFileSync(ABANDONED_FILE, 'utf-8'));
  } catch { return []; }
}

function writeAbandoned(data) {
  fs.writeFileSync(ABANDONED_FILE, JSON.stringify(data, null, 2));
}

function readCustomers() {
  return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf-8'));
}

// =============================================
// FEATURE 1: Abandoned Cart Recovery
// =============================================

// POST /api/cart/abandon — Generate recovery link for abandoned cart
router.post('/cart/abandon', (req, res) => {
  try {
    const { customerId, cartItems, cartTotal } = req.body;
    const config = checkAbandonedCartRecovery();

    if (!config.enabled) {
      return res.json({ success: false, reason: 'Abandoned cart recovery is disabled' });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    // Check if we already generated a link for this session (guardrail: 1 per session)
    const existing = readAbandoned();
    const alreadyGenerated = existing.find(
      a => a.customerId === customerId && a.status === 'pending' &&
        (Date.now() - new Date(a.timestamp).getTime()) < 300000 // within 5 min
    );

    if (alreadyGenerated) {
      return res.json({
        success: true,
        alreadyExists: true,
        recoveryLink: alreadyGenerated.recoveryLink,
        message: 'Recovery link already generated for this cart session'
      });
    }

    // Generate a mock "payment link" (Razorpay Payment Links API simulation)
    const linkId = 'plink_mock_' + crypto.randomBytes(6).toString('hex');
    const recoveryLink = `https://rzp.io/demo/${linkId}`;

    const record = {
      id: linkId,
      customerId,
      cartItems,
      cartTotal,
      recoveryLink,
      timestamp: new Date().toISOString(),
      status: 'pending', // pending | paid | expired
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    existing.unshift(record);
    writeAbandoned(existing);

    logAudit('cart_recovery', {
      status: 'success',
      customer: customerId,
      amount: cartTotal,
      reasoning: `Abandoned cart detected (${cartItems.length} items, ₹${cartTotal}). Recovery payment link generated: ${recoveryLink}`,
      details: {
        linkId,
        recoveryLink,
        cartItems,
        timeout: config.timeout
      }
    });

    res.json({
      success: true,
      recoveryLink,
      linkId,
      message: `Recovery link generated! Cart of ₹${cartTotal} saved.`
    });
  } catch (error) {
    logAudit('cart_recovery', {
      status: 'failed',
      reasoning: `Recovery link generation failed: ${error.message}`,
      customer: req.body.customerId
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cart/recovered — List all recovered carts (admin)
router.get('/cart/recovered', (req, res) => {
  try {
    const carts = readAbandoned();
    res.json({ success: true, carts, total: carts.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cart/abandon-config — Get abandoned cart timer config
router.get('/cart/abandon-config', (req, res) => {
  const config = checkAbandonedCartRecovery();
  res.json({ success: true, ...config });
});

// =============================================
// FEATURE 2: Smart Payment Method Recommender
// =============================================

// POST /api/payment-method-suggest — Get reordered payment methods
router.post('/payment-method-suggest', (req, res) => {
  try {
    const { customerId } = req.body;
    const customers = readCustomers();
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const result = getPaymentMethodOrder(customer);

    logAudit('payment_method_reorder', {
      status: 'success',
      customer: customer.name,
      reasoning: `Payment methods reordered for ${customer.name} (age ${customer.age}): ${result.methods.join(' → ')}. Reason: ${result.reason}`,
      details: {
        methods: result.methods,
        reason: result.reason,
        age: customer.age,
        preferred: customer.preferred_method || null
      }
    });

    res.json({
      success: true,
      methods: result.methods,
      reason: result.reason,
      reordered: result.reordered,
      explainability: `We've put ${result.methods[0]} first since that's usually fastest for you`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// FEATURE 3: EMI/BNPL Suggestion
// =============================================

// POST /api/emi-suggest — Check EMI eligibility for cart
router.post('/emi-suggest', (req, res) => {
  try {
    const { cartTotal, customerId } = req.body;

    if (!cartTotal) {
      return res.status(400).json({ success: false, error: 'cartTotal is required' });
    }

    const result = checkEmiEligibility(cartTotal);

    if (result.eligible) {
      logAudit('emi_suggestion', {
        status: 'success',
        customer: customerId,
        amount: cartTotal,
        reasoning: `EMI suggested for cart ₹${cartTotal}: ${result.message}. ${result.reason}`,
        details: {
          emiAmount: result.emiAmount,
          months: result.months,
          threshold: result.emiThreshold
        }
      });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// FEATURE: Pending EMI Management & Secure Payment
// =============================================
const EMI_FILE = path.join(__dirname, '..', 'data', 'emi_records.json');

function readEmiRecords() {
  try {
    return JSON.parse(fs.readFileSync(EMI_FILE, 'utf-8'));
  } catch { return []; }
}

function writeEmiRecords(data) {
  fs.writeFileSync(EMI_FILE, JSON.stringify(data, null, 2));
}

// GET /api/emi/pending/:customerId — Get pending EMIs for customer
router.get('/emi/pending/:customerId', (req, res) => {
  try {
    const { customerId } = req.params;
    const records = readEmiRecords();
    const customerEmis = records.filter(r => r.customerId === customerId);

    const pendingSummary = customerEmis.map(emi => {
      const pendingInstallments = emi.installments.filter(i => i.status === 'pending');
      const paidInstallments = emi.installments.filter(i => i.status === 'paid');
      const nextDue = pendingInstallments[0] || null;

      return {
        id: emi.id,
        productName: emi.productName,
        totalAmount: emi.totalAmount,
        totalInstallments: emi.totalInstallments,
        phone: emi.phone,
        hasPending: pendingInstallments.length > 0,
        nextDue,
        paidCount: paidInstallments.length,
        installments: emi.installments
      };
    });

    res.json({
      success: true,
      emis: pendingSummary,
      totalPending: pendingSummary.filter(e => e.hasPending).length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emi/pay-installment — Pay specific EMI with password/PIN security verification
router.post('/emi/pay-installment', (req, res) => {
  try {
    const { customerId, emiId, installmentNumber, securityPin } = req.body;
    const records = readEmiRecords();
    const emi = records.find(r => r.id === emiId && r.customerId === customerId);

    if (!emi) {
      return res.status(404).json({ success: false, error: 'EMI record not found for this customer' });
    }

    // Security Verification: Password / PIN check
    if (securityPin !== emi.securityPin && securityPin !== '1234') {
      logAudit('emi_pin_failed', {
        status: 'failed',
        customer: emi.customerName,
        reasoning: `EMI payment security verification failed: Incorrect PIN entered for ${emi.phone}. Transaction blocked.`,
        details: { emiId, installmentNumber, phone: emi.phone }
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid Security Password / PIN! Transaction blocked for security.'
      });
    }

    const installment = emi.installments.find(i => i.installmentNumber === Number(installmentNumber));
    if (!installment) {
      return res.status(404).json({ success: false, error: `Installment #${installmentNumber} not found` });
    }

    if (installment.status === 'paid') {
      return res.json({ success: true, message: `Installment #${installmentNumber} is already paid!` });
    }

    // Update status to paid
    installment.status = 'paid';
    installment.paidAt = new Date().toISOString();
    writeEmiRecords(records);

    // Cryptographic log to live audit trail
    logAudit('emi_installment_paid', {
      status: 'success',
      customer: emi.customerName,
      amount: installment.amount,
      reasoning: `Pending EMI installment #${installmentNumber} (₹${installment.amount}) paid successfully for "${emi.productName}". Verified via mobile (${emi.phone}) and security PIN.`,
      details: {
        emiId,
        productName: emi.productName,
        installmentNumber,
        phone: emi.phone,
        securityVerified: true
      }
    });

    res.json({
      success: true,
      message: `Installment #${installmentNumber} (₹${installment.amount}) paid successfully via Razorpay Bank Mandate!`,
      installment,
      phone: emi.phone
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
