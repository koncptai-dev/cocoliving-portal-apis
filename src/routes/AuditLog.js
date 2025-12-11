const express = require("express");
const router = express.Router();
const AuditLogController = require("../controllers/AuditLog");

router.get("/get", AuditLogController.getAuditLogs);

module.exports = router;
