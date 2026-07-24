const axios = require("axios");

const IDTO_BASE_URL = process.env.IDTO_BASE_URL || "https://prod.idto.ai";
const IDTO_CLIENT_ID = process.env.IDTO_CLIENT_ID;
const IDTO_API_KEY = process.env.IDTO_API_KEY;

if (!IDTO_CLIENT_ID || !IDTO_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[idtoEsignService] IDTO_CLIENT_ID / IDTO_API_KEY are not set. " +
      "Set them in your environment before calling initiateEsign()."
  );
}

const idtoClient = axios.create({
  baseURL: IDTO_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "X-Client-ID": IDTO_CLIENT_ID,
    "X-API-KEY": IDTO_API_KEY
  }
});

function redactCallbackToken(value) {
  if (typeof value !== "string") return value;
  const token = process.env.ESIGN_CALLBACK_TOKEN;
  return value
    .replaceAll(token || "__no_token__", "[redacted]")
    .replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
}

function getSafeProviderDetails(responseData) {
  if (typeof responseData === "string") return redactCallbackToken(responseData);
  if (!responseData || typeof responseData !== "object") return undefined;

  const details = responseData.detail;
  if (Array.isArray(details)) {
    return details.map(({ type, loc, msg }) => ({ type, loc, msg: redactCallbackToken(msg) }));
  }
  if (typeof details === "string") return redactCallbackToken(details);
  if (typeof responseData.message === "string") return redactCallbackToken(responseData.message);
  if (typeof responseData.error === "string") return redactCallbackToken(responseData.error);
  if (typeof responseData.error?.message === "string") {
    return redactCallbackToken(responseData.error.message);
  }

  return { responseKeys: Object.keys(responseData) };
}

function redactProviderResponse(value, key = "") {
  if (/^(content|file_content|token|api[_-]?key|authorization)$/i.test(key)) {
    return "[redacted]";
  }
  if (typeof value === "string") return redactCallbackToken(value);
  if (Array.isArray(value)) return value.map(item => redactProviderResponse(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactProviderResponse(entryValue, entryKey)
      ])
    );
  }
  return value;
}

async function initiateEsign(payload) {
  try {
    const { data } = await idtoClient.post("/verify/esign", payload);
    return data;
  } catch (err) {
    const responseData = err.response?.data;
    console.error(
      "[idtoEsignService] IDTO error response (PDF content removed):",
      redactProviderResponse(responseData)
    );
    const error = new Error("IDto eSign request failed");
    error.status = err.response?.status;
    error.providerDetails = getSafeProviderDetails(responseData);
    if (process.env.IDTO_DEBUG_ERRORS === "true") {
      error.providerResponse = redactProviderResponse(responseData);
    }
    throw error;
  }
}

async function fetchEsignDocument(payload) {
  try {
    const { data } = await idtoClient.post("/verify/esign/document", payload);
    return data;
  } catch (err) {
    const responseData = err.response?.data;
    console.error(
      "[idtoEsignService] IDTO document fetch error (PDF content removed):",
      redactProviderResponse(responseData)
    );
    const error = new Error("IDTO eSign document fetch failed");
    error.status = err.response?.status;
    error.providerDetails = getSafeProviderDetails(responseData);
    throw error;
  }
}

module.exports = { initiateEsign, fetchEsignDocument };
