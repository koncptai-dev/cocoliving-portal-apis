const ScheduledVisit = require('../models/scheduledVisit');
const { logApiCall } = require('../helpers/auditLog');
const { mailsender } = require('../utils/emailService');
const { scheduledVisitEmail } = require("../utils/emailTemplates/emailTemplates");

exports.createScheduledVisit = async (req, res) => {
  try {
    const { name, email, phone, visitDate } = req.body;

    if (!name || !email || !phone || !visitDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const visitDay = new Date(visitDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    const visit = await ScheduledVisit.create({
      name,
      email,
      phone,
      visitDate,
    });
    const { html, attachments } = scheduledVisitEmail({
      name,
      visitDate,
    });

    // same mail admin and user(who has scheduled the visit)
    await mailsender(
      `${email}`,
      "New Scheduled Visit - Coco Living",
      html,
      attachments
    );
    await logApiCall(req, res, 201, `Scheduled visit created (ID: ${visit.id})`, 'scheduledVisit', visit.id);

    return res.status(201).json({
      message: 'Visit scheduled successfully',
      visit,
    });

  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Error creating scheduled visit', 'scheduledVisit');
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getScheduledVisitList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: visits } = await ScheduledVisit.findAndCountAll({
      order: [
        ["visitDate", "DESC"],
      ],
      limit, offset
    });

    return res.status(200).json({ success: true, total: count, page, totalPages: Math.ceil(count / limit), data: visits, });
  } catch (error) {
    console.error("Schedule Visit List Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch schedule visit list", });
  }
};
exports.updateScheduledVisitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const visit = await ScheduledVisit.findByPk(id);

    if (!visit) {
      return res.status(404).json({ message: 'Visit not found' });
    }

    if (visit.status === 'approved') {
      return res.status(400).json({ message: 'This visit is already approved' });
    }

    if (visit.status === 'denied') {
      return res.status(400).json({ message: 'This visit is already denied' });
    }

    visit.status = status;
    await visit.save();

    // EMAIL CONTENT
    let subject = '';
    let html = '';

    if (status === 'approved') {
      subject = 'Visit Request Approved';
      html = `
        <p>Dear ${visit.name},</p>
        <p>Your request to visit our property has been approved.</p>
        <p>Please visit during working hours on ${visit.visitDate}.</p>
        <p>Regards,<br/>COCO Living Team</p>
      `;
    } else {
      subject = 'Visit Request Denied';
      html = `
        <p>Dear ${visit.name},</p>
        <p>Due to some reason we will not be able to help you visit our site on ${visit.visitDate}.</p>
        <p>Please select another date and we will try to accommodate your visit.</p>
        <p>Regards,<br/>COCO Living Team</p>
      `;
    }

    await mailsender(visit.email, subject, html);

    return res.status(200).json({
      message: `Visit ${status} successfully`,
      visit
    });

  } catch (error) {
    console.error('Update visit status error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};