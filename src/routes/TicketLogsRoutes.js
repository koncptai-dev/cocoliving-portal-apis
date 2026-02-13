const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const controller = require("../controllers/TicketLogController");
const authorizeRole = require("../middleware/authorizeRole");

// admin nd user
router.get("/:ticketId", authenticateToken, authorizeRole(1,2,3), controller.getLogsByTicket);

module.exports = router;