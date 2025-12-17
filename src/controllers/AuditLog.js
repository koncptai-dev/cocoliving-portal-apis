const AuditLog = require("../models/auditLog");
const { logApiCall } = require("../helpers/auditLog");

exports.getAuditLogs = async (req, res) => {
  try {
    const auditLogs = await AuditLog.findAll();
    await logApiCall(req, res, 200, "Viewed audit logs list", "auditLog");
    return res.status(200).json({ auditLogs });
  } catch (error) {
    await logApiCall(req, res, 500, "Error occurred while fetching audit logs", "auditLog");
    return res.status(500).json({
      message: "Failed to get audit logs",
      error: error.message,
    });
  }
};
