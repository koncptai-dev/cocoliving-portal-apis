const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const ContractController = require("../controllers/ContractController");

router.get("/:bookingId", authenticateToken, ContractController.getContract);

router.post( "/:bookingId/initiate-esign", authenticateToken, ContractController.initiateEsign);

router.post( "/esign/callback", express.json({ limit: "15mb" }), ContractController.esignCallback );
module.exports = router;