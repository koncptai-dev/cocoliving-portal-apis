const SupportTicket = require('../models/supportTicket');

exports.generateSupportTicketCode = async () => {
  try {
    // Fetch all existing support codes 
    const tickets = await SupportTicket.findAll({
      attributes: ['supportCode']
    });

    // Find the highest sequence number unique
    let maxSeq = 0;
    tickets.forEach(ticket => {
      const match = ticket.supportCode?.match(/SUPP-(\d+)/);
      if (match && match[1]) {
        const num = parseInt(match[1]);
        if (num > maxSeq) maxSeq = num;
      }
    });

    // Increment sequence safely
    const nextSeq = (maxSeq + 1).toString().padStart(3, '0');
    const newCode = `SUPP-${nextSeq}`;

    return newCode;
  } catch (error) {
    console.error("Error generating support ticket code:", error);
    throw error;
  }
};
