const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const ContractController = require("../controllers/ContractController");

router.get("/:bookingId", authenticateToken, ContractController.getContract);

router.post(
  "/:bookingId/sign",
  authenticateToken,
  upload.fields([
  { name: "tenantSignature", maxCount: 1 },
  { name: "guardianSignature", maxCount: 1 }
]),
  ContractController.signContract
);

router.post(
  "/:bookingId/admin-sign",
  authenticateToken,
  upload.fields([{ name: "adminSignature", maxCount: 1 }]),
  ContractController.adminSignContract
);

module.exports = router;