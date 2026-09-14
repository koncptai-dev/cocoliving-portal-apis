const Razorpay = require('razorpay');
const razorpayConfig = require('./razorpayConfig');

const razorpay = new Razorpay({
  key_id: razorpayConfig.keyId,
  key_secret: razorpayConfig.keySecret,
});

async function createOrder({ amount, receipt, notes = {} }) {
  return razorpay.orders.create({
    amount: Number(amount),
    currency: 'INR',
    receipt,
    notes,
  });
}

async function fetchPayment(paymentId) {
  return razorpay.payments.fetch(paymentId);
}

async function createRefund(paymentId, amount, notes = {}) {
  return razorpay.payments.refund(paymentId, {
    amount: Number(amount),
    notes,
  });
}

async function fetchRefund(paymentId, refundId) {
  return razorpay.payments.fetchRefund(paymentId, refundId);
}

async function fetchOrder(orderId) {
  return razorpay.orders.fetch(orderId);
}

module.exports = {
  razorpay,
  createOrder,
  fetchPayment,
  createRefund,
  fetchRefund,
  fetchOrder
};