const SupportTicket = require('../models/supportTicket');
const TicketLog = require('../models/ticketLog');

exports.webhook = async (req, res) => {
  try {
    const payload = req.body;

    console.log('ALISTE WEBHOOK RECEIVED:', JSON.stringify(payload, null, 2));
    console.log('Ticket ID:', payload?.ticketId);
    console.log('Status:', payload?.status);
    console.log(
      'Activities:',
      JSON.stringify(payload?.activity, null, 2)
    );

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
      case 'resolved':
        ticket.status = 'resolved';
        break;

      case 'ongoing':
        ticket.status = 'in-progress';
        break;

      case 'pending':
        ticket.status = 'pending';
        break;

      case 'onhold':
        ticket.status = 'onhold';
        break;

      case 'reopened':
        ticket.status = 'open';
        break;

      case 'inactive':
        ticket.status = 'inactive';
        break;

      case 'archived':
        ticket.status = 'archived';
        break;

      default:
        console.warn(
          '[ALISTE WEBHOOK] Unknown status:',
          normalizedStatus
        );
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