const fetch = require('node-fetch');
const {
  CREATE_PAYMENT_URL,
  ORDER_STATUS_URL_TEMPLATE,
  REFUND_URL,
  MOBILE_SDK_ORDER_URL
} = require('./phonepeConfig');
const { getPhonePeAuthToken } = require('./phonepeAuth');

// Create Payment Website
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

// Fetch Order Status
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

// Initiate Refund
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

// Create Order ( Mobile App )
async function createMobileOrder({ merchantOrderId, amount, userId }) {
  const token = await getPhonePeAuthToken();
  console.log('PhonePe Mobile SDK URL:', MOBILE_SDK_ORDER_URL);
  const res = await fetch(MOBILE_SDK_ORDER_URL, {
      method: 'POST',
      headers: {
        Authorization: `O-Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchantOrderId,
        amount,
        expireAfter: 1200,
        metaInfo: {
          udf1: String(userId || ''),
        },
        paymentFlow: { type: 'PG_CHECKOUT' },
      }),
    }
  );

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error('Failed to create PhonePe mobile order');
  }

  const body = json.body || json;

  return {
    orderId: body.orderId,
    token: body.token,
    state: body.state,
    expireAt: body.expireAt,
  };
}

module.exports = {
  createPayment,
  getOrderStatus,
  initiateRefund,
  createMobileOrder,
};