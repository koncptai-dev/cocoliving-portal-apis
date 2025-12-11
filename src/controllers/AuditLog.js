const AuditLog = require("../models/auditLog");

exports.getAuditLogs = async (req, res) => {
  try {
    const auditLogs = await AuditLog.findAll();
    return res.status(200).json({ auditLogs });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get audit logs",
      error: error.message,
    });
  }
};
