require("dotenv").config();
const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const UserKYC = require("../models/userKYC");
const authMiddleware = require('../middleware/auth');
const User = require("../models/user");
const { nameMatchService } = require("../helpers/nameMatchfunction");
const upload = require("../middleware/upload");

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

router.post("/verify-account", authMiddleware, validateConfig, async (req, res) => {
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

router.post("/initiate-session", authMiddleware, upload.fields([ { name: "aadhaar_front", maxCount: 1 }, { name: "aadhaar_back", maxCount: 1 }, ]), validateConfig, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.files?.aadhaar_front || !req.files?.aadhaar_back) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar front and back images are required",
      });
    }
    let kyc = await UserKYC.findOne({ where: { userId } });
    const aadhaarFrontImage = `/uploads/kycDocuments/${req.files.aadhaar_front[0].filename}`;
    const aadhaarBackImage  = `/uploads/kycDocuments/${req.files.aadhaar_back[0].filename}`;

    if (kyc) {
      await kyc.update({
        aadhaarFrontImage,
        aadhaarBackImage,
      });
    } else {
      await UserKYC.create({
        userId,
        aadhaarFrontImage,
        aadhaarBackImage,
      });
    }
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

router.post("/fetch-aadhaar", validateConfig, authMiddleware, async (req, res) => {
  try {
    const { reference_key } = req.body;

    if (!reference_key) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "reference_key is required",
      });
    }

    //fetch user name
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    const fullName = user?.fullName;

    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is missing in user profile" });
    }

    //call idto adhar api
    const result = await makeIdtoRequest(
      "/fetch_aadhaar",
      {
        reference_key: reference_key,
      },
      "application/xml"
    );

    //parse XML
    const parser = new xml2js.Parser({ explicitArray: false });
    const aadhaarData = await parser.parseStringPromise(result);

    const uidData = aadhaarData.Certificate.CertificateData.KycRes.UidData;

    if (!uidData) {
      const ekycStatus = "not-verified";
      return res.status(500).json({
        success: false,
        ekycStatus,
        message: "Invalid Aadhaar XML response",
      });
    }

    //extract adhar data
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

    //name match
    const nameMatchResult = await nameMatchService(fullName, aadhaarName);
    const { matchScore, matched } = nameMatchResult;

    //decision
    const storeResult = idtoVerified && matchScore >= 60;
    const ekycStatus = storeResult ? "verified" : "not-verified";

    //failure reason
    let failureReason = null;

    if (!storeResult && idtoVerified) {
      failureReason = "Profile Full Name does not match Aadhaar records";
    }

    if (!idtoVerified) {
      failureReason = "Aadhaar verification failed at IDTO";
    }

    const [kycRecord, created] = await UserKYC.findOrCreate({
      where: { userId },
      defaults: {
        aadhaarLast4: last4,
        ekycStatus,
        verifiedAtAadhaar: storeResult ? new Date() : null,
        adharKycResponse: JSON.stringify(details),

        //name match
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

        //name match
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
      failureReason
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
      return res.json({ success: true, ekycStatus: "not-verified" });
    }

    res.json({
      success: true,
      ekycStatus: kycRecord.ekycStatus || "not-verified",
      verifiedAt: kycRecord.verifiedAtAadhaar || null,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
});

module.exports = router;