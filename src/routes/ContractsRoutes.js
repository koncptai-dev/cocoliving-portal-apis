const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const ContractController = require("../controllers/ContractController");

router.get("/:bookingId", authenticateToken, ContractController.getContract);

router.post(
  "/:bookingId/sign",
  authenticateToken,
  upload.single("signature"),
  ContractController.signContract
);

module.exports = router;