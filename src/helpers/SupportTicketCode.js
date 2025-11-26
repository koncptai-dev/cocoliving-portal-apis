const SupportTicket = require("../models/supportTicket");
const sequelize = require("../config/database");

exports.generateSupportTicketCode = async (propertyId, roomNumber) => {
  try {
    return await sequelize.transaction(async (t) => {
      // Lock only relevant tickets (same property + same room number)
      const lastTicket = await SupportTicket.findOne({
        where: { propertyId, roomNumber },
        order: [["createdAt", "DESC"]],
        attributes: ["supportCode"],
        transaction: t,
        lock: t.LOCK.UPDATE, // ✅ Prevents concurrent duplicates
      });

      // Extract sequence number from last ticket code
      let lastSeq = 0;
      if (lastTicket && lastTicket.supportCode) {
        const match = lastTicket.supportCode.match(/SUPP-PR\d+-RM\d+-(\d+)/);
        if (match && match[1]) {
          lastSeq = parseInt(match[1]);
        }
      }

      // Increment sequence
      const nextSeq = String(lastSeq + 1).padStart(3, "0");

      // Generate new code
      const newCode = `SUPP-PR${propertyId}-RM${roomNumber}-${nextSeq}`;

      return newCode;
    });
  } catch (error) {
    console.error("Error generating support ticket code:", error);
    throw error;
  }
};
