require("dotenv").config();
const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const UserKYC = require("../models/userKYC");
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const API_BASE_URL = process.env.IDTO_BASE_URL_PROD || "https://prod.idto.ai/verify/digilocker";
const API_KEY = process.env.IDTO_API_KEY;
const CLIENT_ID = process.env.IDTO_CLIENT_ID;

const validateConfig = (req, res, next) => {
  if (!API_KEY || !CLIENT_ID) {
    return res.status(500).json({
      error: "Server configuration error",
      message: "API_KEY and CLIENT_ID must be set in environment variables",
    });
  }
  next();
};

const makeIdtoRequest = async (
  endpoint,
  data,
  acceptHeader
) => {
  try {
    console.log("hi");

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
      responseType: "json",
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log("hello");

      throw {
        status: error.response.status,
        message: error.response.data || error.message,
      };

    }
    throw {
      status: 500,
      message: error.message || "Internal server error",
    };
  }
};

router.post("/verify-account", validateConfig, async (req, res) => {
  try {
    const { mobile_number } = req.body;

    if (!mobile_number) {
      return res.status(400).json({
        error: "Validation error",
        message: "mobile_number is required",
      });
    }

    const result = await makeIdtoRequest("/verify_account", {
      mobile_number: mobile_number,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to verify account",
    });
  }
});

router.post("/initiate-session", validateConfig, async (req, res) => {
  try {
    const {
      consent,
      consent_purpose,
      redirect_url,
      redirect_to_signup,
      documents_for_consent,
    } = req.body;

    if (consent === undefined || !consent_purpose || !redirect_url) {
      return res.status(400).json({
        error: "Validation error",
        message: "consent, consent_purpose, and redirect_url are required",
      });
    }

    if (redirect_to_signup === undefined) {
      return res.status(400).json({
        error: "Validation error",
        message: "redirect_to_signup is required",
      });
    }

    const result = await makeIdtoRequest("/initiate_session", {
      consent: consent,
      consent_purpose: consent_purpose,
      redirect_url: redirect_url,
      redirect_to_signup: redirect_to_signup,
      documents_for_consent: documents_for_consent || [],
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to initiate session",
    });
  }
});

router.post("/get-reference", validateConfig, async (req, res) => {
  try {
    const { code, code_verifier } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({
        error: "Validation error",
        message: "code and code_verifier are required",
      });
    }

    const result = await makeIdtoRequest("/get_reference", {
      code: code,
      code_verifier: code_verifier,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to get reference key",
    });
  }
});

router.post(
  "/fetch-aadhaar",
  validateConfig,
  authMiddleware,
  async (req, res) => {
    try {
      const { reference_key } = req.body;

      if (!reference_key) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          message: "reference_key is required",
        });
      }

      const result = await makeIdtoRequest(
        "/fetch_aadhaar",
        {
          reference_key: reference_key,
        },
        "application/xml"
      );
      const userId = req.user.id;

      const parser = new xml2js.Parser({ explicitArray: false });
      const aadhaarData = await parser.parseStringPromise(result);

      const uidData = aadhaarData.Certificate.CertificateData.KycRes.UidData;
      if (!uidData) {
        const ekycStatus = "not_verified";
        return res.status(500).json({
          success: false,
          ekycStatus,
          message: "Invalid Aadhaar XML response",
        });
      }

      const poi = uidData.Poi;
      const poa = uidData.Poa;

      const details = {
        dob: poi.$.dob,
        gender: poi.$.gender,
        name: poi.$.name,
        country: poa.$.country,
        dist: poa.$.dist,
        pc: poa.$.pc,
        state: poi.$.state,
        street: poa.$.street,
        vtc: poa.$.vtc,
      };

      const last4 = String(uidData.$.uid).slice(-4);
      console.log(last4);

      const kycRes = aadhaarData.Certificate.CertificateData.KycRes;
      const ekycStatus = kycRes.$.ret === "Y" ? "verified" : "not_verified";
      console.log(ekycStatus);

      const [kycRecord, created] = await UserKYC.findOrCreate({
        where: { userId },
        defaults: {
          aadhaarLast4: last4,
          ekycStatus,
          verifiedAtAadhaar: new Date(),
          adharKycResponse: JSON.stringify(details),
        },
      });

      if (!created) {
        await kycRecord.update({
          aadhaarLast4: last4,
          ekycStatus,
          verifiedAtAadhaar: new Date(),
          adharKycResponse: JSON.stringify(details),
        });
      }

      res.json({
        success: true,
        message: "Aadhaar KYC verified successfully",
        ekycStatus,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        error: error.message || "Failed to fetch Aadhaar",
      });
    }
  }
);

router.get("/aadhaar-status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const kycRecord = await UserKYC.findOne({ where: { userId } });

    if (!kycRecord) {
      return res.json({ success: true, ekycStatus: "not_verified" });
    }

    res.json({
      success: true,
      ekycStatus: kycRecord.ekycStatus || "not_verified",
      aadhaarLast4: kycRecord.aadhaarLast4 || null,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
});

module.exports = router;