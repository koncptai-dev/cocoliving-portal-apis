const AuditLog = require("../models/auditLog");

exports.createAuditLog = async (
  userId,
  description,
  role,
  entity,
  entityId,
  status
) => {
  try {
    await AuditLog.create({
      userId,
      description,
      role,
      entity,
      entityId,
      status,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
};
