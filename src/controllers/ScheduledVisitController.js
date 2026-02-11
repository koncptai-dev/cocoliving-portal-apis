const ScheduledVisit = require('../models/scheduledVisit');
const Property = require('../models/property');
const { logApiCall } = require('../helpers/auditLog');

exports.createScheduledVisit = async (req, res) => {
  try {
    const { name, email, phone, visitDate, propertyId } = req.body;

    if (!name || !email || !phone || !visitDate || !propertyId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const visitDay = new Date(visitDate);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    const property = await Property.findByPk(propertyId);
    if (!property || property.is_active === false) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const visit = await ScheduledVisit.create({
      name,
      email,
      phone,
      visitDate,
      propertyId,
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