require("dotenv").config();
const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const UserKYC = require("../models/userKYC");
const authMiddleware = require('../middleware/auth');
const User = require("../models/user");
const { nameMatchService } = require("../helpers/nameMatchfunction");
const upload = require("../middleware/upload");
const parentNotAllowed = require("../middleware/parentNotAllowed");

const router = express.Router();

const API_BASE_URL = process.env.IDTO_BASE_URL_PROD || "https://prod.idto.ai/verify/digilocker";
const API_KEY = process.env.IDTO_API_KEY;
const CLIENT_ID = process.env.IDTO_CLIENT_ID;

const IDTO_FETCH_AADHAAR_CODES = {
  2007: {
    errorCode: "AADHAAR_NOT_ISSUED",
    httpStatus: 422,
    userMessage: "Aadhaar has not been issued to your DigiLocker account. Please use an alternate KYC document.",
    faultSide: "user_digilocker_account",
  },
  2005: {
    errorCode: "AADHAAR_CONSENT_DENIED",
    httpStatus: 422,
    userMessage: "Aadhaar access was denied on DigiLocker's consent screen. Please retry and allow access, or use an alternate document.",
    faultSide: "user_action",
  },
  2009: {
    errorCode: "AADHAAR_TEMPORARILY_UNAVAILABLE",
    httpStatus: 503,
    userMessage: "Aadhaar is temporarily unavailable from DigiLocker. Please retry shortly.",
    faultSide: "digilocker_transient",
  },
  2010: {
    errorCode: "DIGILOCKER_SESSION_EXPIRED",
    httpStatus: 408,
    userMessage: "Your DigiLocker session expired. Please restart verification.",
    faultSide: "timing",
  },
};

function parseFetchAadhaarResult(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (trimmed.startsWith("<")) {
    return { kind: "xml", xml: trimmed };
  }

  if (trimmed.startsWith("{")) {
    try {
      const body = JSON.parse(trimmed);
      const code = body.code ?? body.error_code;
      const known = IDTO_FETCH_AADHAAR_CODES[code];
      if (known) {
        return { kind: "known_code", code, ...known, rawBody: body };
      }
      return { kind: "unknown_json", rawBody: body };
    } catch {
      return { kind: "unparseable", raw: trimmed };
    }
  }

  return { kind: "unparseable", raw: trimmed };
}

const DIGILOCKER_RAW_PATTERNS = [
  {
    match: /404 Client Error: Not Found for url:.*xml\/eaadhaar/i,
    errorCode: "IDTO_UNHANDLED_UPSTREAM_404",
    httpStatus: 502,
    userMessage:
      "We couldn't complete Aadhaar verification right now. Please try again shortly.",
    escalateToIdto: true,
  },
  {
    match: /aadhaar_not_linked/i,
    errorCode: "AADHAAR_NOT_LINKED",
    httpStatus: 422,
    userMessage: "Your DigiLocker account has no Aadhaar linked. Please link it and try again.",
  },
  {
    match: /aadhaar_not_available/i,
    errorCode: "AADHAAR_DATA_UNAVAILABLE",
    httpStatus: 422,
    userMessage: "Aadhaar data isn't available for your account. Please redo Aadhaar KYC on DigiLocker.",
  },
  {
    match: /invalid_token/i,
    errorCode: "DIGILOCKER_SESSION_EXPIRED",
    httpStatus: 408,
    userMessage: "Your DigiLocker session expired. Please try verifying again.",
  },
  {
    match: /invalid_uri/i,
    errorCode: "AADHAAR_DOCUMENT_NOT_FOUND",
    httpStatus: 422,
    userMessage: "We couldn't locate your Aadhaar document via DigiLocker. Please try again.",
  },
];

function classifyIdtoError(error) {
  const rawMessage =
    typeof error?.message === "string"
      ? error.message
      : JSON.stringify(error?.message ?? error);

  const parsed = parseFetchAadhaarResult(rawMessage);
  if (parsed.kind === "known_code") {
    return {
      errorCode: parsed.errorCode,
      httpStatus: parsed.httpStatus,
      userMessage: parsed.userMessage,
      origin: parsed.faultSide,
      rawMessage,
    };
  }

  for (const pattern of DIGILOCKER_RAW_PATTERNS) {
    if (pattern.match.test(rawMessage)) {
      return {
        errorCode: pattern.errorCode,
        httpStatus: pattern.httpStatus,
        userMessage: pattern.userMessage,
        origin: "digilocker_upstream",
        rawMessage,
      };
    }
  }

  return {
    errorCode: "IDTO_UNCLASSIFIED_ERROR",
    httpStatus: error?.status || 500,
    userMessage: "We couldn't complete Aadhaar verification right now. Please try again shortly.",
    origin: "unclassified",
    rawMessage,
  };
}

function logKycFailure({ stage, userId, role, referenceKey, error }) {
  const classified = classifyIdtoError(error);
  console.error(JSON.stringify({
    level: "error",
    event: "kyc_failure",
    stage,
    userId,
    role,
    referenceKey: referenceKey || null,
    errorCode: classified.errorCode,
    origin: classified.origin,
    httpStatusFromIdto: error?.status || null,
    rawMessage: classified.rawMessage,
    timestamp: new Date().toISOString(),
  }));
  return classified;
}

const inFlightReferenceKeys = new Set();

const validateConfig = (req, res, next) => {
  if (!API_KEY || !CLIENT_ID) {
    console.error("Missing API credentials");
    return res.status(500).json({
      success: false,
      errorCode: "SERVER_CONFIG_ERROR",
      error: "Server configuration error",
    });
  }
  next();
};

const makeIdtoRequest = async (endpoint, data, acceptHeader, responseType = "json") => {
  try {
    const response = await axios({
      method: "POST",
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        accept: acceptHeader || "application/json",
        "content-type": "application/json",
        "X-API-KEY": API_KEY,
        "X-Client-ID": CLIENT_ID,
      },
      data: data,
      responseType,
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", error.response.data);

      throw {
        status: error.response.status,
        message: error.response.data || error.message,
      };
    }

    console.error("Axios Error:", error.message);
    throw {
      status: 500,
      message: error.message || "Internal server error",
    };
  }
};

router.post("/verify-account", authMiddleware, parentNotAllowed, validateConfig, async (req, res) => {
  const userId = req.user?.id;
  try {
    const { mobile_number } = req.body;

    if (!mobile_number) {
      return res.status(400).json({
        success: false,
        errorCode: "VALIDATION_ERROR",
        error: "Validation error",
        message: "mobile_number is required",
      });
    }

    const result = await makeIdtoRequest("/verify_account", { mobile_number });

    res.json({ success: true, data: result });
  } catch (error) {
    const classified = logKycFailure({ stage: "verify-account", userId, error });
    res.status(classified.httpStatus).json({
      success: false,
      errorCode: classified.errorCode,
      error: classified.userMessage,
      message: classified.userMessage,
    });
  }
});

router.post(
  "/initiate-session",
  authMiddleware,
  parentNotAllowed,
  upload.fields([{ name: "aadhaar_front", maxCount: 1 }, { name: "aadhaar_back", maxCount: 1 }]),
  validateConfig,
  async (req, res) => {
    const userId = req.user?.id;
    const role = req.user?.role;
    try {
      if (!req.files?.aadhaar_front || !req.files?.aadhaar_back) {
        return res.status(400).json({
          success: false,
          errorCode: "VALIDATION_ERROR",
          message: "Aadhaar front and back images are required",
        });
      }
      let kyc = await UserKYC.findOne({ where: { userId, role } });
      const aadhaarFrontImage = `/uploads/kycDocuments/${req.files.aadhaar_front[0].filename}`;
      const aadhaarBackImage = `/uploads/kycDocuments/${req.files.aadhaar_back[0].filename}`;

      if (kyc) {
        await kyc.update({ aadhaarFrontImage, aadhaarBackImage });
      } else {
        await UserKYC.create({ userId, role, aadhaarFrontImage, aadhaarBackImage });
      }

      const { consent, consent_purpose, redirect_url, redirect_to_signup, documents_for_consent } = req.body;

      if (consent === undefined || !consent_purpose || !redirect_url) {
        return res.status(400).json({
          success: false,
          errorCode: "VALIDATION_ERROR",
          error: "Validation error",
          message: "consent, consent_purpose, and redirect_url are required",
        });
      }

      if (redirect_to_signup === undefined) {
        return res.status(400).json({
          success: false,
          errorCode: "VALIDATION_ERROR",
          error: "Validation error",
          message: "redirect_to_signup is required",
        });
      }

      let parsedDocuments = documents_for_consent;
      if (typeof documents_for_consent === "string") {
        try {
          parsedDocuments = JSON.parse(documents_for_consent);
        } catch {
          parsedDocuments = [];
        }
      }

      const normalizedConsent = consent === true || consent === "true";
      const normalizedRedirect = redirect_to_signup === true || redirect_to_signup === "true";

      const result = await makeIdtoRequest("/initiate_session", {
        consent: normalizedConsent,
        consent_purpose,
        redirect_url,
        redirect_to_signup: normalizedRedirect,
        documents_for_consent: parsedDocuments,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      const classified = logKycFailure({ stage: "initiate-session", userId, role, error });
      res.status(classified.httpStatus).json({
        success: false,
        errorCode: classified.errorCode,
        error: classified.userMessage,
        message: classified.userMessage,
      });
    }
  }
);

router.post("/get-reference", authMiddleware, parentNotAllowed, validateConfig, async (req, res) => {
  const userId = req.user?.id;
  try {
    const { code, code_verifier } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({
        success: false,
        errorCode: "VALIDATION_ERROR",
        error: "Validation error",
        message: "code and code_verifier are required",
      });
    }

    const result = await makeIdtoRequest("/get_reference", { code, code_verifier });

    res.json({ success: true, data: result });
  } catch (error) {
    const classified = logKycFailure({ stage: "get-reference", userId, error });
    res.status(classified.httpStatus).json({
      success: false,
      errorCode: classified.errorCode,
      error: classified.userMessage,
      message: classified.userMessage,
    });
  }
});

router.post("/fetch-aadhaar", authMiddleware, parentNotAllowed, validateConfig, async (req, res) => {
  const { reference_key } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    if (![2, 3].includes(role)) {
      return res.status(403).json({
        success: false,
        errorCode: "UNAUTHORIZED_ROLE",
        message: "Unauthorized role for KYC",
      });
    }

    if (!reference_key) {
      return res.status(400).json({
        success: false,
        errorCode: "VALIDATION_ERROR",
        error: "Validation error",
        message: "reference_key is required",
      });
    }

    // Reject a concurrent duplicate call with the same reference_key instead
    // of forwarding it to IDTO, where it would consume/collide with the
    // first call's DigiLocker token and come back as a confusing 404.
    if (inFlightReferenceKeys.has(reference_key)) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "duplicate_fetch_aadhaar_call",
        userId,
        referenceKey: reference_key,
        timestamp: new Date().toISOString(),
      }));
      return res.status(409).json({
        success: false,
        errorCode: "DUPLICATE_REQUEST_IN_PROGRESS",
        message: "Aadhaar verification for this session is already being processed. Please wait.",
      });
    }
    inFlightReferenceKeys.add(reference_key);

    try {
      const existingKyc = await UserKYC.findOne({ where: { userId, role } });

      if (existingKyc && existingKyc.ekycStatus === "verified") {
        return res.status(200).json({
          success: true,
          message: "Aadhaar already verified",
          ekycStatus: "verified",
          verifiedAt: existingKyc.verifiedAtAadhaar,
        });
      }

      const user = await User.findByPk(userId);
      const fullName = user?.fullName;

      if (!fullName) {
        return res.status(400).json({
          success: false,
          errorCode: "PROFILE_INCOMPLETE",
          message: "Full name is missing in user profile",
        });
      }
      const result = await makeIdtoRequest(
        "/fetch_aadhaar",
        { reference_key },
        "application/xml",
        "text"
      );

      const shaped = parseFetchAadhaarResult(result);

      if (shaped.kind === "known_code") {
        console.error(JSON.stringify({
          level: "error",
          event: "kyc_failure",
          stage: "fetch-aadhaar",
          errorCode: shaped.errorCode,
          idtoCode: shaped.code,
          userId,
          referenceKey: reference_key,
          timestamp: new Date().toISOString(),
        }));
        return res.status(shaped.httpStatus).json({
          success: false,
          errorCode: shaped.errorCode,
          ekycStatus: "not-verified",
          message: shaped.userMessage,
        });
      }

      if (shaped.kind !== "xml") {
        console.error(JSON.stringify({
          level: "error",
          event: "kyc_failure",
          stage: "fetch-aadhaar",
          errorCode: "IDTO_RESPONSE_SHAPE_MISMATCH",
          userId,
          referenceKey: reference_key,
          rawBody: shaped.rawBody ?? shaped.raw,
          timestamp: new Date().toISOString(),
        }));
        return res.status(502).json({
          success: false,
          errorCode: "IDTO_RESPONSE_SHAPE_MISMATCH",
          ekycStatus: "not-verified",
          message: "We received an unexpected response while verifying Aadhaar. Please try again shortly.",
        });
      }

      const parser = new xml2js.Parser({ explicitArray: false });
      const aadhaarData = await parser.parseStringPromise(shaped.xml);

      const uidData = aadhaarData?.Certificate?.CertificateData?.KycRes?.UidData;

      if (!uidData) {
        console.error(JSON.stringify({
          level: "error",
          event: "kyc_failure",
          stage: "fetch-aadhaar",
          errorCode: "INVALID_AADHAAR_XML",
          userId,
          referenceKey: reference_key,
          timestamp: new Date().toISOString(),
        }));
        return res.status(422).json({
          success: false,
          errorCode: "INVALID_AADHAAR_XML",
          ekycStatus: "not-verified",
          message: "Invalid Aadhaar XML response",
        });
      }

      const poi = uidData.Poi;
      const poa = uidData.Poa;
      const aadhaarName = poi?.$?.name || "";

      const details = {
        dob: poi.$.dob,
        gender: poi.$.gender,
        name: aadhaarName,
        country: poa.$.country,
        dist: poa.$.dist,
        pc: poa.$.pc,
        state: poi.$.state,
        street: poa.$.street,
        vtc: poa.$.vtc,
      };

      const last4 = String(uidData.$.uid).slice(-4);
      const kycRes = aadhaarData.Certificate.CertificateData.KycRes;
      const idtoVerified = kycRes?.$?.ret === "Y";

      const nameMatchResult = await nameMatchService(fullName, aadhaarName);
      const { matchScore, matched } = nameMatchResult;

      const storeResult = idtoVerified && matchScore >= 60;
      const ekycStatus = storeResult ? "verified" : "not-verified";

      let failureReason = null;
      if (!storeResult && idtoVerified) {
        failureReason = "Profile Full Name does not match Aadhaar records";
      }
      if (!idtoVerified) {
        failureReason = "Aadhaar verification failed at IDTO";
      }

      const [kycRecord, created] = await UserKYC.findOrCreate({
        where: { userId, role },
        defaults: {
          aadhaarLast4: last4,
          ekycStatus,
          verifiedAtAadhaar: storeResult ? new Date() : null,
          adharKycResponse: JSON.stringify(details),
          adharNameMatchScore: matchScore,
          adharNameMatchResponse: JSON.stringify(nameMatchResult),
          adharNameMatched: matched,
        },
      });

      if (!created) {
        await kycRecord.update({
          aadhaarLast4: last4,
          ekycStatus,
          verifiedAtAadhaar: storeResult ? new Date() : null,
          adharKycResponse: JSON.stringify(details),
          adharNameMatchScore: matchScore,
          adharNameMatchResponse: JSON.stringify(nameMatchResult),
          adharNameMatched: matched,
        });
      }

      res.json({
        success: true,
        message: storeResult ? "Aadhaar KYC verified successfully" : "Aadhaar verification failed due to name mismatch",
        ekycStatus,
        adharNameMatchScore: matchScore,
        failureReason,
      });
    } finally {
      inFlightReferenceKeys.delete(reference_key);
    }
  } catch (error) {
    const classified = logKycFailure({ stage: "fetch-aadhaar", userId, role, referenceKey: reference_key, error });
    res.status(classified.httpStatus).json({
      success: false,
      errorCode: classified.errorCode,
      error: classified.userMessage,
      message: classified.userMessage,
    });
  }
});

router.get("/aadhaar-status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    if (![2, 3].includes(role)) {
      return res.status(403).json({ success: false, message: "Unauthorized role" });
    }
    const kycRecord = await UserKYC.findOne({ where: { userId, role } });

    if (!kycRecord) {
      return res.json({ success: true, ekycStatus: "not-verified" });
    }

    res.json({
      success: true,
      ekycStatus: kycRecord.ekycStatus || "not-verified",
      verifiedAt: kycRecord.verifiedAtAadhaar || null,
      role: role === 2 ? "user" : "admin",
    });
  } catch (error) {
    console.error("aadhaar-status error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
});

module.exports = router;