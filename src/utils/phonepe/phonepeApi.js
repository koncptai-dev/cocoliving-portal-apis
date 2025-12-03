// utils/phonepe/phonepeApi.js
const fetch = require('node-fetch');
const {
  CREATE_PAYMENT_URL,
  ORDER_STATUS_URL_TEMPLATE,
  REFUND_URL,
} = require('./phonepeConfig');
const { getPhonePeAuthToken } = require('./phonepeAuth');

/**
 * Create a payment on PhonePe Standard Checkout
 */
async function createPayment(payload) {
  const token = await getPhonePeAuthToken();

  const res = await fetch(CREATE_PAYMENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `O-Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);

  return {
    success: res.ok,
    status: res.status,
    body: json,
  };
}

/**
 * Fetch order status from PhonePe
 */
async function getOrderStatus(merchantOrderId) {
  const token = await getPhonePeAuthToken();
  const url = ORDER_STATUS_URL_TEMPLATE.replace('{merchantOrderId}', encodeURIComponent(merchantOrderId));

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `O-Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json = await res.json().catch(() => null);

  return {
    success: res.ok,
    status: res.status,
    body: json,
  };
}

/**
 * Initiate refund with PhonePe
 */
async function initiateRefund(payload) {
  const token = await getPhonePeAuthToken();

  const res = await fetch(REFUND_URL, {
    method: 'POST',
    headers: {
      Authorization: `O-Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);

  return {
    success: res.ok,
    status: res.status,
    body: json,
  };
}

module.exports = {
  createPayment,
  getOrderStatus,
  initiateRefund,
};