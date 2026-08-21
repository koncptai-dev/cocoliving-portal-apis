const axios = require("axios");

const IDTO_BASE_URL = process.env.IDTO_BASE_URL || "https://prod.idto.ai";
const IDTO_CLIENT_ID = process.env.IDTO_CLIENT_ID;
const IDTO_API_KEY = process.env.IDTO_API_KEY;

if (!IDTO_CLIENT_ID || !IDTO_API_KEY) {
  console.warn(
    "[idtoEsignService] IDTO_CLIENT_ID / IDTO_API_KEY are not set."
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

/**
 * Only callback tokens / credential-like values are redacted.
 * Everything else is logged.
 */
function redactCallbackToken(value) {
  if (typeof value !== "string") return value;

  const token = process.env.ESIGN_CALLBACK_TOKEN;

  let result = value;

  if (token) {
    result = result.replaceAll(token, "[REDACTED_CALLBACK_TOKEN]");
  }

  result = result.replace(
    /([?&]token=)[^&\s]+/gi,
    "$1[REDACTED_CALLBACK_TOKEN]"
  );

  return result;
}

function redactSensitiveValue(value, key = "") {
  if (/^(x-api-key|api[_-]?key|authorization)$/i.test(key)) {
    return "[REDACTED_CREDENTIAL]";
  }

  if (/^(token|callback_token|esign_callback_token)$/i.test(key)) {
    return "[REDACTED_TOKEN]";
  }

  if (typeof value === "string") {
    return redactCallbackToken(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitiveValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}

/**
 * Payload logger.
 *
 * We DO NOT print PDF base64.
 * We DO print everything else exactly.
 */
function getSafeRequestPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const copy = JSON.parse(JSON.stringify(payload));

  if (Array.isArray(copy.documents)) {
    copy.documents = copy.documents.map(document => ({
      ...document,
      content: document.content
        ? `[PDF_BASE64_REDACTED length=${document.content.length}]`
        : document.content
    }));
  }

  return redactSensitiveValue(copy);
}

function logAxiosRequest(config) {
  console.info(
    "\n========== IDTO AXIOS REQUEST =========="
  );

  console.info("[idtoEsignService] Method:", config.method);
  console.info("[idtoEsignService] Base URL:", config.baseURL);
  console.info("[idtoEsignService] URL:", config.url);
  console.info(
    "[idtoEsignService] Full URL:",
    `${config.baseURL || ""}${config.url || ""}`
  );

  console.info(
    "[idtoEsignService] Request headers:",
    redactSensitiveValue(config.headers || {})
  );

  if (config.data) {
    let parsedData = config.data;

    try {
      if (typeof config.data === "string") {
        parsedData = JSON.parse(config.data);
      }
    } catch (_) {
      // Leave as-is if Axios data is not JSON.
    }

    console.info(
      "[idtoEsignService] Request body:",
      getSafeRequestPayload(parsedData)
    );
  }

  console.info(
    "========== END IDTO AXIOS REQUEST ==========\n"
  );
}

function logAxiosResponse(response) {
  console.info(
    "\n========== IDTO AXIOS RESPONSE =========="
  );

  console.info(
    "[idtoEsignService] Status:",
    response.status
  );

  console.info(
    "[idtoEsignService] Status text:",
    response.statusText
  );

  console.info(
    "[idtoEsignService] Response headers:",
    response.headers
  );

  console.info(
    "[idtoEsignService] Response body:",
    redactSensitiveValue(response.data)
  );

  console.info(
    "========== END IDTO AXIOS RESPONSE ==========\n"
  );
}

function logAxiosError(err) {
  console.error(
    "\n========== IDTO AXIOS ERROR =========="
  );

  console.error(
    "[idtoEsignService] Error name:",
    err.name
  );

  console.error(
    "[idtoEsignService] Error message:",
    err.message
  );

  console.error(
    "[idtoEsignService] Error code:",
    err.code
  );

  console.error(
    "[idtoEsignService] Error status:",
    err.status
  );

  if (err.config) {
    console.error(
      "[idtoEsignService] Failed request method:",
      err.config.method
    );

    console.error(
      "[idtoEsignService] Failed request URL:",
      `${err.config.baseURL || ""}${err.config.url || ""}`
    );

    console.error(
      "[idtoEsignService] Failed request headers:",
      redactSensitiveValue(err.config.headers || {})
    );

    let requestData = err.config.data;

    try {
      if (typeof requestData === "string") {
        requestData = JSON.parse(requestData);
      }
    } catch (_) {}

    console.error(
      "[idtoEsignService] Failed request body:",
      getSafeRequestPayload(requestData)
    );
  }

  if (err.response) {
    console.error(
      "[idtoEsignService] Response status:",
      err.response.status
    );

    console.error(
      "[idtoEsignService] Response status text:",
      err.response.statusText
    );

    console.error(
      "[idtoEsignService] Response headers:",
      err.response.headers
    );

    console.error(
      "[idtoEsignService] FULL IDTO RESPONSE:",
      redactSensitiveValue(err.response.data)
    );
  } else {
    console.error(
      "[idtoEsignService] No HTTP response received."
    );
  }

  if (err.request) {
    console.error(
      "[idtoEsignService] Axios request object exists."
    );
  }

  console.error(
    "[idtoEsignService] Axios error stack:",
    err.stack
  );

  console.error(
    "========== END IDTO AXIOS ERROR ==========\n"
  );
}

async function initiateEsign(payload) {
  console.info(
    "\n\n##################################################"
  );

  console.info(
    "[idtoEsignService] initiateEsign() START"
  );

  console.info(
    "[idtoEsignService] Environment:",
    {
      IDTO_BASE_URL,
      hasClientId: Boolean(IDTO_CLIENT_ID),
      clientIdLength: IDTO_CLIENT_ID?.length || 0,
      hasApiKey: Boolean(IDTO_API_KEY),
      apiKeyLength: IDTO_API_KEY?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      pm2Process: process.env.name || process.env.pm_id
    }
  );

  console.info(
    "[idtoEsignService] Payload:",
    getSafeRequestPayload(payload)
  );

  console.info(
    "[idtoEsignService] Payload JSON length:",
    JSON.stringify(payload).length
  );

  if (Array.isArray(payload?.documents)) {
    console.info(
      "[idtoEsignService] Documents count:",
      payload.documents.length
    );

    payload.documents.forEach((document, index) => {
      console.info(
        `[idtoEsignService] Document ${index}:`,
        {
          reference_doc_id: document.reference_doc_id,
          content_type: document.content_type,
          content_length: document.content?.length,
          signature_sequence: document.signature_sequence,
          return_url: redactCallbackToken(document.return_url),
          return_url_type: typeof document.return_url,
          content_type_type: typeof document.content_type,
          reference_doc_id_type: typeof document.reference_doc_id,
          signature_sequence_type: typeof document.signature_sequence
        }
      );
    });
  }

  if (Array.isArray(payload?.signers_info)) {
    console.info(
      "[idtoEsignService] Signers count:",
      payload.signers_info.length
    );

    payload.signers_info.forEach((signer, index) => {
      console.info(
        `[idtoEsignService] Signer ${index}:`,
        signer
      );

      console.info(
        `[idtoEsignService] Signer ${index} field types:`,
        Object.fromEntries(
          Object.entries(signer).map(([key, value]) => [
            key,
            Array.isArray(value)
              ? "array"
              : typeof value
          ])
        )
      );
    });
  }

  try {
    console.info(
      "[idtoEsignService] Sending POST /verify/esign..."
    );

    const { data } = await idtoClient.post(
      "/verify/esign",
      payload
    );

    console.info(
      "[idtoEsignService] IDTO request succeeded."
    );

    console.info(
      "[idtoEsignService] Raw response:",
      redactSensitiveValue(data)
    );

    console.info(
      "[idtoEsignService] Response type:",
      typeof data
    );

    if (data && typeof data === "object") {
      console.info(
        "[idtoEsignService] Response keys:",
        Object.keys(data)
      );
    }

    console.info(
      "[idtoEsignService] initiateEsign() END"
    );

    console.info(
      "##################################################\n"
    );

    return data;

  } catch (err) {

    logAxiosError(err);

    const responseData = err.response?.data;

    const error = new Error(
      "IDto eSign request failed"
    );

    error.status = err.response?.status;
    error.providerDetails = responseData?.detail || responseData;

    if (process.env.IDTO_DEBUG_ERRORS === "true") {
      error.providerResponse =
        redactSensitiveValue(responseData);
    }

    throw error;
  }
}

async function fetchEsignDocument(payload) {
  console.info(
    "\n========== IDTO DOCUMENT FETCH =========="
  );

  console.info(
    "[idtoEsignService] Fetch payload:",
    redactSensitiveValue(payload)
  );

  try {
    const response = await idtoClient.post(
      "/verify/esign/document",
      payload
    );

    console.info(
      "[idtoEsignService] Document fetch status:",
      response.status
    );

    console.info(
      "[idtoEsignService] Document fetch response:",
      redactSensitiveValue(response.data)
    );

    console.info(
      "========== END IDTO DOCUMENT FETCH ==========\n"
    );

    return response.data;

  } catch (err) {

    logAxiosError(err);

    const responseData = err.response?.data;

    const error = new Error(
      "IDTO eSign document fetch failed"
    );

    error.status = err.response?.status;
    error.providerDetails = responseData?.detail || responseData;

    throw error;
  }
}

module.exports = {  initiateEsign, fetchEsignDocument };