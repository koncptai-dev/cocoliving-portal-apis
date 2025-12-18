const TicketLog = require("../models/ticketLog");
const User = require("../models/user");

async function logTicketEvent({
  ticketId,
  actionType,
  oldValue = null,
  newValue,
  actorId,
  transaction = null,
}) {
  const user = await User.findByPk(actorId, {
    attributes: ["id", "fullName", "email", "role"],
  });

  if (!user) {
    throw new Error("Invalid user for ticket log");
  }

  return TicketLog.create(
    {
      ticketId,
      actionType,
      oldValue,
      newValue,
      performedBy: user.id,
      performedByName: user.fullName || user.email,
      performedByRole: user.role,
    },
    transaction ? { transaction } : {}
  );
}

module.exports = { logTicketEvent };