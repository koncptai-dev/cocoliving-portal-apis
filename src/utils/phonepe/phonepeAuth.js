const fetch = require('node-fetch');
const qs = require('querystring');
const {
  AUTH_TOKEN_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
} = require('./phonepeConfig');

let cachedToken = null;
let tokenExpiryMs = 0;

async function fetchNewToken() {
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

  if (!response.ok || !json?.access_token || !json?.expires_at) {
    console.error('[PhonePe] Auth Token Error:', json);
    throw new Error('Failed to fetch PhonePe auth token');
  }

  cachedToken = json.access_token;

  // expires_at is epoch seconds → convert to ms
  // subtract 60 seconds as buffer
  tokenExpiryMs = (json.expires_at * 1000) - (60 * 1000);

  return cachedToken;
}
async function getPhonePeAuthToken() {
  if (cachedToken && Date.now() < tokenExpiryMs) {
    return cachedToken;
  }
  return fetchNewToken();
}
function clearPhonePeAuthToken() {
  cachedToken = null;
  tokenExpiryMs = 0;
}
module.exports = {
  getPhonePeAuthToken,
  clearPhonePeAuthToken,
};