const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const ContractController = require("../controllers/ContractController");

router.get("/:bookingId", authenticateToken, ContractController.getContract);

router.post( "/:bookingId/initiate-esign", authenticateToken, ContractController.initiateEsign);

router.post(
  "/:bookingId/admin-sign",
  authenticateToken,
  upload.fields([{ name: "adminSignature", maxCount: 1 }]),
  ContractController.adminSignContract
);

router.post("/esign/callback", ContractController.esignCallback);
router.post(
  "/esign/calibration/callback",
  ContractController.esignCalibrationCallback
);
module.exports = router;
