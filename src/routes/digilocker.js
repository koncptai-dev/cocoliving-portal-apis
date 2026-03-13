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

console.log("========== DIGILOCKER CONFIG ==========");
console.log("API_BASE_URL:", API_BASE_URL);
console.log("API_KEY present:", API_KEY ? true : false);
console.log("CLIENT_ID present:", CLIENT_ID ? true : false);
console.log("=======================================");

const validateConfig = (req, res, next) => {

  console.log("validateConfig middleware triggered");

  if (!API_KEY || !CLIENT_ID) {

    console.error("Missing API credentials");
    console.log("API_KEY:", API_KEY);
    console.log("CLIENT_ID:", CLIENT_ID);

    return res.status(500).json({
      error: "Server configuration error",
      message: "API_KEY and CLIENT_ID must be set in environment variables",
    });
  }

  console.log("API credentials verified");

  next();
};
const makeIdtoRequest = async (
  endpoint,
  data,
  acceptHeader
) => {

  console.log("========== IDTO REQUEST ==========");
  console.log("Endpoint:", endpoint);
  console.log("URL:", `${API_BASE_URL}${endpoint}`);
  console.log("Payload:", data);
  console.log("Accept Header:", acceptHeader || "application/json");

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
      responseType: "json",
    });

    console.log("IDTO Response Status:", response.status);
    console.log("IDTO Response Data:", response.data);
    console.log("===================================");

    return response.data;

  } catch (error) {

    console.error("========== IDTO ERROR ==========");

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

router.post("/verify-account", authMiddleware, validateConfig, async (req, res) => {
  console.log("========== VERIFY ACCOUNT ROUTE ==========");
  console.log("Request body:", req.body);
  console.log("User:", req.user);
  try {
    const { mobile_number } = req.body;

    if (!mobile_number) {
      return res.status(400).json({
        error: "Validation error",
        message: "mobile_number is required",
      });
    }

    console.log("Calling IDTO verify_account API...");
    const result = await makeIdtoRequest("/verify_account", {
      mobile_number: mobile_number,
    });
    console.log("verify_account result:", result);

    res.json({
      success: true,
      data: result,
    });
    
  } catch (error) {
    console.error("verify-account error:", error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to verify account",
    });
  }
});

router.post("/initiate-session", authMiddleware, upload.fields([ { name: "aadhaar_front", maxCount: 1 }, { name: "aadhaar_back", maxCount: 1 }, ]), validateConfig, async (req, res) => {
  console.log("========== INITIATE SESSION ==========");
  console.log("User:", req.user);
  console.log("Body:", req.body);
  console.log("Files:", req.files);
  try {
    const userId = req.user.id;
    const role = req.user.role; 
    
    if (!req.files?.aadhaar_front || !req.files?.aadhaar_back) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar front and back images are required",
      });
    }
    let kyc = await UserKYC.findOne({ where: { userId,role } });
    console.log("Existing KYC:", kyc);
    const aadhaarFrontImage = `/uploads/kycDocuments/${req.files.aadhaar_front[0].filename}`;
    const aadhaarBackImage  = `/uploads/kycDocuments/${req.files.aadhaar_back[0].filename}`;
    console.log("Aadhaar Front Path:", aadhaarFrontImage);
    console.log("Aadhaar Back Path:", aadhaarBackImage);

    if (kyc) {
      await kyc.update({
        aadhaarFrontImage,
        aadhaarBackImage,
      });
    } else {
      await UserKYC.create({
        userId,
        role,
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
    console.log("Calling IDTO initiate_session...");
    console.log("Consent:", normalizedConsent);
    console.log("Redirect:", normalizedRedirect);
    console.log("Documents:", parsedDocuments);
    const result = await makeIdtoRequest("/initiate_session", {
      consent: normalizedConsent,
      consent_purpose: consent_purpose,
      redirect_url: redirect_url,
      redirect_to_signup: normalizedRedirect,
      documents_for_consent: parsedDocuments,
    });
    console.log("initiate_session result:", result);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("initiate-session error:", error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to initiate session",
    });
  }
});

router.post("/get-reference", validateConfig, async (req, res) => {
  console.log("========== GET REFERENCE ==========");
  console.log("Body:", req.body);
  try {
    const { code, code_verifier } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({
        error: "Validation error",
        message: "code and code_verifier are required",
      });
    }

    console.log("Calling IDTO get_reference...");
    const result = await makeIdtoRequest("/get_reference", {
      code: code,
      code_verifier: code_verifier,
    });
    console.log("Reference response:", result);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("get-reference error:", error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to get reference key",
    });
  }
});

router.post("/fetch-aadhaar", validateConfig, authMiddleware, async (req, res) => {
  console.log("========== FETCH AADHAAR ==========");
  console.log("User:", req.user);
  console.log("Body:", req.body);
  try {
    const { reference_key } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    console.log("Role verified:", role);
    /*  Role check (same as PAN) */
    if (![2, 3].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role for KYC",
      });
    }

    if (!reference_key) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "reference_key is required",
      });
    }

    //check exisiting KYC
    const existingKyc = await UserKYC.findOne({
      where: { userId, role },
    });

    console.log("Existing KYC record:", existingKyc);
    if (existingKyc && existingKyc.ekycStatus === "verified") {
      return res.status(200).json({
        success: true,
        message: "Aadhaar already verified",
        ekycStatus: "verified",
        verifiedAt: existingKyc.verifiedAtAadhaar,
      });
    }

    //fetch user name
    const user = await User.findByPk(userId);
    const fullName = user?.fullName;

    console.log("User fetched:", user);
    console.log("User fullName:", fullName);
    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is missing in user profile" });
    }

    console.log("Calling IDTO fetch_aadhaar...");
    console.log("Reference key:", reference_key);
    //call idto adhar api
    const result = await makeIdtoRequest(
      "/fetch_aadhaar",
      {
        reference_key: reference_key,
      },
      "application/xml"
    );

    console.log("Raw Aadhaar XML:", result);
    //parse XML
    const parser = new xml2js.Parser({ explicitArray: false });
    const aadhaarData = await parser.parseStringPromise(result);

    console.log("Parsed Aadhaar data:", aadhaarData);
    const uidData = aadhaarData.Certificate.CertificateData.KycRes.UidData;

    console.log("UID Data:", uidData);
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

    console.log("Aadhaar Name:", aadhaarName);
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

    console.log("Extracted Aadhaar Details:", details);
    const last4 = String(uidData.$.uid).slice(-4);

    const kycRes = aadhaarData.Certificate.CertificateData.KycRes;
    const idtoVerified = kycRes?.$?.ret === "Y";

    console.log("IDTO Verified:", idtoVerified);
    //name match
    console.log("Calling nameMatchService...");
    console.log("Profile Name:", fullName);
    console.log("Aadhaar Name:", aadhaarName);
    const nameMatchResult = await nameMatchService(fullName, aadhaarName);
    
    const { matchScore, matched } = nameMatchResult;

    console.log("Name Match Result:", nameMatchResult);
    console.log("Match Score:", matchScore);
    console.log("Matched:", matched);
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

    console.log("Store Result:", storeResult);
    console.log("ekycStatus:", ekycStatus);
    console.log("failureReason:", failureReason);
    const [kycRecord, created] = await UserKYC.findOrCreate({
      where: { userId, role },
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
    console.log("KYC Record:", kycRecord);
    console.log("Created:", created);

    res.json({
      success: true,
      message: storeResult ? "Aadhaar KYC verified successfully" : "Aadhaar verification failed due to name mismatch",
      ekycStatus,
      adharNameMatchScore: matchScore,
      failureReason
    });
  } catch (error) {
    console.error("fetch-aadhaar error:", error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to fetch Aadhaar",
    });
  }
}
);

router.get("/aadhaar-status", authMiddleware, async (req, res) => {
  console.log("========== AADHAAR STATUS ==========");
  console.log("User:", req.user);
  try {
    const userId = req.user.id;
    const role = req.user.role;
    // Only allow user and admin
    if (![2, 3].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role",
      });
    }
    const kycRecord = await UserKYC.findOne({ where: { userId,role } });

    if (!kycRecord) {
      return res.json({ success: true, ekycStatus: "not-verified" });
    }

    console.log("KYC Record:", kycRecord);
    res.json({
      success: true,
      ekycStatus: kycRecord.ekycStatus || "not-verified",
      verifiedAt: kycRecord.verifiedAtAadhaar || null,
      role: role === 2 ? 'user' : 'admin', 
    });
  } catch (error) {
    console.error("aadhaar-status error:", error);
    console.log(error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
});

module.exports = router;