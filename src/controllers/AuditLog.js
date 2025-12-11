const AuditLog = require("../models/auditLog");

exports.createAuditLog = async (req, res) => {
  try {
    const { userId, description, role, entity, entityId } = req.body;
    const auditLog = await AuditLog.create({
      userId,
      description,
      role,
      entity,
      entityId,
    });
    return res.status(201).json({
      message: "Audit log created successfully",
      auditLog,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create audit log",
      error: error.message,
    });
  }
};

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
