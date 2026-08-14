const express = require("express");

const router = express.Router();

const AccountsManagementController = require("../controllers/AccountsManagementController");

const authMiddleware = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");
const authorizePage = require("../middleware/authorizePage");

router.post( "/bookings/:bookingId/decision", authMiddleware, authorizeRole(1, 3), authorizePage("Accounts Management", "write"), require("../middleware/upload").single("invoice"), AccountsManagementController.decideAccounting );

module.exports = router;