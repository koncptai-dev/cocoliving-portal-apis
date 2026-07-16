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

async function initiateEsign(payload) {
  try {
    const { data } = await idtoClient.post("/verify/esign", payload);
    return data;
  } catch (err) {
    const responseData = err.response?.data;
    const details = responseData?.detail;
    const error = new Error("IDto eSign request failed");
    error.status = err.response?.status;
    error.providerDetails = Array.isArray(details)
      ? details.map(({ type, loc, msg }) => ({ type, loc, msg }))
      : typeof details === "string"
        ? details
        : responseData?.message || responseData?.error || undefined;
    throw error;
  }
}

module.exports = { initiateEsign };
