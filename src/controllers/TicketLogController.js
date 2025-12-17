const TicketLog = require("../models/ticketLog");
const SupportTicket = require("../models/supportTicket");

exports.getLogsByTicket = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;

    const ticket = await SupportTicket.findByPk(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const where = { ticketId };

    if (req.user.role === 2) {
      where.actionType = {
        [require("sequelize").Op.ne]: "ASSIGNMENT",
      };
    }

    const logs = await TicketLog.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });
    res.json({ logs });
  } catch (error) {
    console.error("getLogsByTicket", error);
    res.status(500).json({ message: error.message });
  }
};