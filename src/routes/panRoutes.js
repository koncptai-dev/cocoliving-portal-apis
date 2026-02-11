const express = require('express');
const router = express.Router();
const { verifyPAN } = require('../controllers/panController');
const panLimiter = require('../utils/ratelimiter');
const UserKYC = require("../models/userKYC");
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post('/verify-pan', authenticateToken, panLimiter,upload.single("pan_image") , verifyPAN);

//for pan status
router.get("/pan-status", authenticateToken, async (req, res) => {
  try {
     const userId = req.user.id;
       const role = req.user.role;

    // Fetch the KYC record for this user
    const kycRecord = await UserKYC.findOne({ where: { userId,role } });

    if (!kycRecord) {
      return res.status(200).json({
        success: true,
        panStatus: "not-verified",
        panNumber: null,
      });
    }

    res.status(200).json({
      success: true,
      panStatus: kycRecord.panStatus || "not-verified",
      panNumber: kycRecord.panNumber || null,
      verifiedAt: kycRecord.verifiedAtPan || null,
    });
    
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Failed to fetch Aadhaar status" });
  }
}); 

module.exports = router;