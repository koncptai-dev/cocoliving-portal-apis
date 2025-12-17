const AuditLog = require("../models/auditLog");
const User = require("../models/user");

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

const getRoleName = (role) => {
  if (role === 1) return "Superadmin";
  if (role === 3) return "Admin";
  return "User";
};

const getStatusString = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) {
    return "Success";
  }
  return "Failed";
};

exports.logApiCall = async (
  req,
  res,
  statusCode,
  description,
  entity,
  entityId = 0
) => {
  try {
    // Skip logging for audit log endpoints to prevent infinite loops
    if (entity === "AuditLog" || entity === "auditLog") {
      return;
    }

    // Skip logging if no user (for unauthenticated endpoints like login)
    // But we still want to log login attempts, so we handle that differently
    if (!req.user || !req.user.id) {
      // For auth-related entities, we might want to log without userId
      // But for now, we'll skip to avoid errors
      return;
    }

    const userId = req.user.id;
    const status = getStatusString(statusCode);

    const user = await User.findByPk(userId, {
      attributes: ["role", "roleName"],
    });
    const role = user?.roleName || getRoleName(user?.role || 2);

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
