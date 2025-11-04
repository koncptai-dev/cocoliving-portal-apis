const SupportTicket = require('../models/supportTicket');

exports.generateSupportTicketCode = async (roomNumber) => {
  try {
    // Get all tickets for this room
    const tickets = await SupportTicket.findAll({
      where: { roomNumber },
      attributes: ['supportCode']
    });

    // Find highest existing sequence number
    let maxSeq = 0;
    tickets.forEach(ticket => {
      const match = ticket.supportCode?.match(/SUPP-RM\d+-(\d+)/);
      if (match && match[1]) {
        const num = parseInt(match[1]);
        if (num > maxSeq) maxSeq = num;
      }
    });

    // Increment sequence
    const nextSeq = (maxSeq + 1).toString().padStart(3, '0');
    const newCode = `SUPP-RM${roomNumber}-${nextSeq}`;

    return newCode;
  } catch (error) {
    console.error("Error generating support ticket code:", error);
    throw error;
  }
};
