const express = require('express');
const router = express.Router();
const { verifyPAN } = require('../controllers/panController');
const panLimiter = require('../utils/ratelimiter');
const UserKYC = require("../models/userKYC");
const authenticateToken = require("../middleware/auth");


router.post('/verify-pan', authenticateToken, panLimiter, verifyPAN);

//for pan status
router.get("/pan-status", authenticateToken, async (req, res) => {
  try {
     const userId = req.user.id;

    // Fetch the KYC record for this user
    const kycRecord = await UserKYC.findOne({ where: { userId } });

    if (!kycRecord) {
      return res.status(200).json({
        success: true,
        panStatus: "not-verified",
        failureReason: "PAN not submitted",
      });
    }

    res.status(200).json({
      success: true,
      panStatus: kycRecord.panStatus || "not-verified",
      verifiedAt: kycRecord.verifiedAtPan || null,
      failureReason: kycRecord.failureReason || null,
    });
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
}); 

module.exports = router;