const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const controller = require("../controllers/TicketLogController");

router.get("/:ticketId", authenticateToken, controller.getLogsByTicket);

module.exports = router;