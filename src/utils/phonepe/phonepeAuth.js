// utils/phonepe/phonepeAuth.js
const fetch = require('node-fetch');
const qs = require('querystring');
const {
  AUTH_TOKEN_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
} = require('./phonepeConfig');

/**
 * Fetch OAuth token (O-Bearer) required for PhonePe APIs
 * returns access_token string
 */
async function getPhonePeAuthToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PhonePe client credentials missing');
  }

  const body = qs.stringify({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    client_version: CLIENT_VERSION,
  });

  const response = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || !json.access_token) {
    console.error('[PhonePe] Auth Token Error:', json);
    throw new Error('Failed to fetch PhonePe auth token');
  }

  return json.access_token;
}

module.exports = { getPhonePeAuthToken };