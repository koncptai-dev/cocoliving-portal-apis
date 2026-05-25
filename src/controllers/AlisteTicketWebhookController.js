const SupportTicket = require('../models/supportTicket');
const TicketLog = require('../models/ticketLog');

exports.webhook = async (req, res) => {
  try {
    const payload = req.body;

    const ticketId = payload?.ticketId;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID missing',
      });
    }

    const ticket =
      await SupportTicket.findOne({
        where: {
          externalTicketId: ticketId,
        },
      });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    const normalizedStatus = String( payload?.status || '' ).toLowerCase();

    switch (normalizedStatus) {
        case 'created':
            ticket.status = 'open';
            break;

        case 'resolved':
            ticket.status = 'resolved';
            break;

        case 'in-progress':
            ticket.status = 'in-progress';
            break;

        default:
            ticket.status = normalizedStatus;
    }

    await ticket.save();

    const activities =
      payload?.activity || [];

    for (const activity of activities) {
      await TicketLog.create({
        ticketId: ticket.id,
        actionType:
          activity.status || 'UPDATE',
        oldValue: null,
        newValue: activity,
        metadata: payload,
        performedBy: 0,
        performedByName: 'ALISTE',
        performedByRole: 0,
      });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error(
      'Ticket Webhook Error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};