const ScheduledVisit = require('../models/scheduledVisit');
const { logApiCall } = require('../helpers/auditLog');

exports.createScheduledVisit = async (req, res) => {
  try {
    const { name, email, phone, visitDate } = req.body;

    if (!name || !email || !phone || !visitDate ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const visitDay = new Date(visitDate);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    const visit = await ScheduledVisit.create({
      name,
      email,
      phone,
      visitDate,
    });

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
      limit,offset
    });

    return res.status(200).json({ success: true, total:count,page, totalPages: Math.ceil(count / limit),data: visits, });
  } catch (error) {
    console.error("Schedule Visit List Error:", error);
    return res.status(500).json({ success: false,  message: "Failed to fetch schedule visit list", });
  }
};