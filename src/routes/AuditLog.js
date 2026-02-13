const express = require("express");
const router = express.Router();
const AuditLogController = require("../controllers/AuditLog");
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");

// super-admin
router.get("/get",authMiddleware, authorizeRole(1,3), AuditLogController.getAuditLogs);

module.exports = router;
