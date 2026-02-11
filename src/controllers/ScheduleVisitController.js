const ScheduleVisit = require('../models/scheduleVisit');
const { Op } = require('sequelize');

exports.getScheduleVisitList = async (req, res) => {
  try {
     const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: visits } = await ScheduleVisit.findAndCountAll({
      order: [
        ["visitDate", "DESC"],
        ["visitTime", "ASC"],
      ],
      limit,offset
    });

    return res.status(200).json({ success: true, total:count,page, totalPages: Math.ceil(count / limit),data: visits, });
  } catch (error) {
    console.error("Schedule Visit List Error:", error);
    return res.status(500).json({ success: false,  message: "Failed to fetch schedule visit list", });
  }
};
