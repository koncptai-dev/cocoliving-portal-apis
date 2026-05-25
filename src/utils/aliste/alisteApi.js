const fetch = require('node-fetch');

const BASE_URL = process.env.ALISTE_BASE_URL;

async function alisteRequest(endpoint, method = 'POST', body = {}) {
  const url = `${process.env.ALISTE_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: process.env.ALISTE_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    const rawText = await response.text();

    let json = null;

    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    console.log('========== ALISTE API ==========');
    console.log('URL:', url);
    console.log('METHOD:', method);
    console.log('REQUEST:', JSON.stringify(body, null, 2));
    console.log('STATUS:', response.status);
    console.log('RAW RESPONSE:', rawText);
    console.log('================================');

    return {
      success: response.ok,
      status: response.status,
      body: json,
      raw: rawText,
    };
  } catch (error) {
    console.error('ALISTE REQUEST ERROR:', error);

    return {
      success: false,
      status: 500,
      body: null,
      raw: error.message,
    };
  }
}

async function integrateProperty(payload) {
  return alisteRequest('/v2/integration/property/add', 'POST', payload);
}

async function initiateRecharge(payload) {
  return alisteRequest('/integration/recharge/initiate', 'POST', payload);
}

async function getRoomDetails(roomId) {
  return alisteRequest('/integration/room/details', 'POST', {
    roomId: String(roomId),
  });
}

async function addUserToRoom(payload) {
  return alisteRequest('/integration/room/user/add', 'POST', payload);
}

async function removeUserFromRoom(payload) {
  return alisteRequest('/integration/room/user/remove', 'POST', payload);
}

async function getPropertyRooms(propertyId) {
  return alisteRequest(
    '/integration/property/rooms',
    'POST',
    {
      propertyId: String(propertyId),
    }
  );
}

async function getRechargeHistory(payload) {
  return alisteRequest(
    '/integration/room/recharges',
    'POST',
    payload
  );
}

async function createTicket(payload) {
  return alisteRequest(
    '/integration/ticket/create',
    'POST',
    payload
  );
}

module.exports = {
  integrateProperty,
  initiateRecharge,
  getRoomDetails,
  addUserToRoom,
  removeUserFromRoom,
  getPropertyRooms,
  getRechargeHistory,
  createTicket,
};