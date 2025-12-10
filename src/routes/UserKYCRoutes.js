const express = require("express");
const router = express.Router();
const UserKYCController = require("../controllers/UserKYCController");

// Get user KYC details by userId (Admin only)
router.get("/kyc/:userId", UserKYCController.getUserKYC);
router.get("/download/aadhaar/:userId", UserKYCController.downloadAadhaar);

module.exports = router;
