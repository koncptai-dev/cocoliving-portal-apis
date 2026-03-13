const express = require('express');
const router = express.Router();

const { verifyPAN } = require('../controllers/panController');
const panLimiter = require('../utils/ratelimiter');
const UserKYC = require("../models/userKYC");
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post(
    '/verify-pan',
    authenticateToken,
    panLimiter,
    upload.single("pan_image"),
    (req,res,next)=>{
        console.log("========== PAN ROUTE HIT ==========");
        console.log("Headers:",req.headers);
        console.log("Body:",req.body);
        console.log("User:",req.user);
        console.log("File:",req.file);
        next();
    },
    verifyPAN
);

router.get("/pan-status", authenticateToken, async (req, res) => {

  console.log("========== PAN STATUS ROUTE ==========");

  try {

    const userId = req.user.id;
    const role = req.user.role;

    console.log("UserId:",userId);
    console.log("Role:",role);

    const kycRecord = await UserKYC.findOne({ where: { userId,role } });

    console.log("KYC Record:",kycRecord);

    if (!kycRecord) {

      console.log("No KYC record found");

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

    console.error("PAN STATUS ERROR:",error);

    res.status(500).json({
      success:false,
      message:"Failed to fetch Aadhaar status"
    });

  }
});

module.exports = router;