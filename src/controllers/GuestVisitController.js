const { Op } = require('sequelize');
const crypto = require('crypto');

const GuestVisit = require('../models/guestVisit');
const Booking = require('../models/bookRoom');
const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');

const { logApiCall } = require('../helpers/auditLog');
const { mailsender } = require('../utils/emailService');
const { generateQrBuffer } = require('../utils/qrGenerator');

const generateQrToken = () =>
  crypto.randomBytes(32).toString('hex');

const getTodayDateOnly = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (dateOnly) => {
  const d = new Date(dateOnly);
  d.setHours(23, 59, 59, 999);
  return d;
};

const resolveCreatorRole = (user) => {
  if (user.role === 1 || user.role === 3) return 'admin';
  if (user.role === 2) return 'resident';
  return 'unknown';
};

const applyLazyExpiry = async (visits) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const visit of visits) {
    if (
      visit.status === 'scheduled' &&
      new Date(visit.visitDate) < today
    ) {
      visit.status = 'expired';
      await visit.save();
    }
  }
};

exports.createGuestVisit = async (req, res) => {
  try {
    const user = req.user;
    const {
      permitType,
      guestName,
      guestPhone,
      guestEmail,
      visitDate,
      purpose,
      propertyId, // only for workers
    } = req.body;

    if (!permitType || !guestName || !guestPhone || !visitDate) {
      await logApiCall(req, res, 400, 'Missing required fields', 'guestVisit');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const visitDay = new Date(visitDate);
    const today = getTodayDateOnly();

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    let resolvedBooking = null;
    let resolvedPropertyId = null;
    let resolvedRoomId = null;
    let residentUserId = null;

    if (permitType === 'guest') {
      let targetUserId = user.id;
      if (user.role === 1 || user.role === 3) {
        const { selectedUserId } = req.body;

        if (!selectedUserId) {
          return res.status(400).json({ message: "Please select a user" });
        }

        targetUserId = selectedUserId;
      }

      resolvedBooking = await Booking.findOne({
        where: {
          userId: targetUserId,
          checkInDate: { [Op.lte]: today },
          checkOutDate: { [Op.gte]: today },
        },
      });

      if (!resolvedBooking) {
        return res.status(403).json({ message: 'No active booking found' });
      }

      resolvedPropertyId = resolvedBooking.propertyId;
      resolvedRoomId = resolvedBooking.roomId;
      residentUserId = targetUserId;
    }

    if (permitType === 'worker') {
      if (!propertyId) {
        return res.status(400).json({ message: 'propertyId is required for worker visit' });
      }
      resolvedPropertyId = propertyId;

      if (user.role !== 1 && user.role !== 3) {
        const permission = await UserPermission.findByPk(user.id);
        const allowedProperties = permission?.properties || [];
        if (!allowedProperties.includes(resolvedPropertyId)) {
          return res.status(403).json({ message: "you are not allowed to view property." })
        }
      }
    }

    const qrToken = generateQrToken();
    const qrGeneratedAt = new Date();
    const qrExpiresAt = getEndOfDay(visitDate);

    const visit = await GuestVisit.create({
      permitType,
      createdByUserId: user.id,
      createdByRole: resolveCreatorRole(user),
      bookingId: resolvedBooking ? resolvedBooking.id : null,
      residentUserId,
      propertyId: resolvedPropertyId,
      roomId: resolvedRoomId,
      guestName,
      guestPhone,
      guestEmail,
      visitDate,
      purpose,
      qrToken,
      qrGeneratedAt,
      qrExpiresAt,
      status: 'scheduled',
    });

    if (guestEmail) {
      console.log(guestEmail);
      
      const qrBuffer = await generateQrBuffer(qrToken);
      const body = `
        <p>Hello <b>${guestName}</b>,</p>
        <p>Your visit is scheduled on <b>${visitDate}</b>.</p>
        <p>Please present the QR code below at the entrance.</p>
        <img src="cid:guest-qr" alt="Guest QR" />
        <p><b>Rules:</b></p>
        <ul>
          <li>Valid only for the visit date</li>
          <li>Single-use</li>
          <li>Scan required for entry</li>
        </ul>
        <p>- COCO Living</p>
      `;

      const info=await mailsender(
        guestEmail,
        'COCO Living - Guest Entry QR',
        body,
        [
          {
            filename: 'guest-qr.png',
            content: qrBuffer,
            cid: 'guest-qr',
          },
        ]
      );
      //  console.log('Mail sent:', info);
      // console.log('Mail sent successfully');
    }
    await logApiCall(
      req,
      res,
      201,
      `Created guest visit (ID: ${visit.id})`,
      'guestVisit',
      visit.id
    );
    res.status(201).json({ message: 'Guest visit created', visit });

  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Error creating guest visit', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.scanQrAndCheckIn = async (req, res) => {
  try {
    const { qrToken } = req.body;
    const user = req.user;

    if (!qrToken) {
      return res.status(400).json({ message: 'qrToken required' });
    }

    const visit = await GuestVisit.findOne({ where: { qrToken } });

    if (!visit) {
      return res.status(404).json({ message: 'Invalid QR token' });
    }

    const today = getTodayDateOnly();
    const visitDateOnly = new Date(visit.visitDate);
    visitDateOnly.setHours(0, 0, 0, 0);
    if (visitDateOnly < today) {
      if (visit.status === 'scheduled') {
        visit.status = 'expired';
        await visit.save();
      }
      return res.status(400).json({ message: 'Visit Expired' });
    }
    if (visitDateOnly > today) {
      return res.status(400).json({ message: `Visit not valid for today ( Visit scheduled for :${visit.visitDate}` })
    }
    const now = new Date();

    if (visit.status === 'cancelled') {
      return res.status(400).json({ message: 'Visit cancelled' });
    }

    if (visit.status !== 'scheduled') {
      return res.status(400).json({ message: `Visit already ${visit.status}` });
    }

    if (visit.qrExpiresAt < now) {
      visit.status = 'expired';
      await visit.save();
      return res.status(400).json({ message: 'QR expired' });
    }

    if (user.role !== 1 && user.role !== 3) {
      const permission = await UserPermission.findByPk(user.id);
      const allowedProperties = permission?.properties || [];
      if (!allowedProperties.includes(visit.propertyId)) {
        return res.status(403).json({ message: 'No access to this property' });
      }
    }

    visit.status = 'checked-in';
    visit.qrUsedAt = now;
    await visit.save();

    await logApiCall(
      req,
      res,
      200,
      `Guest checked-in (ID: ${visit.id})`,
      'guestVisit',
      visit.id
    );

    res.status(200).json({ message: 'Check-in successful', visit });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'QR scan failed', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.checkOutGuest = async (req, res) => {
  try {
    const { id } = req.params;

    const visit = await GuestVisit.findByPk(id);

    if (!visit) {
      return res.status(404).json({ message: 'Visit not found' });
    }

    if (visit.status !== 'checked-in') {
      return res.status(400).json({ message: 'Guest not checked-in' });
    }

    visit.status = 'checked-out';
    await visit.save();

    await logApiCall(
      req,
      res,
      200,
      `Guest checked-out (ID: ${visit.id})`,
      'guestVisit',
      visit.id
    );

    res.status(200).json({ message: 'Check-out successful', visit });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Check-out failed', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};


exports.getUserGuestVisits = async (req, res) => {
  try {
    const user = req.user;

    const visits = await GuestVisit.findAll({
      where: {
        residentUserId: user.id,
      },
      order: [['createdAt', 'DESC']],
    });

    await applyLazyExpiry(visits);

    await logApiCall(
      req,
      res,
      200,
      'Viewed user guest visits',
      'guestVisit'
    );

    res.status(200).json({ visits });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Failed to fetch user visits', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getPropertyGuestVisits = async (req, res) => {
  try {
    const user = req.user;
    const { propertyId, status, date } = req.query;

    let allowedProperties = [];

    if (user.role === 1) {
      const Property = require('../models/property');
      allowedProperties = await Property.findAll({
        attributes: ['id', 'name'],
      });
    }
    else if (user.role === 3) {
      const permission = await UserPermission.findByPk(user.id);
      if (!permission || !Array.isArray(permission.properties)) {
        return res.status(403).json({ message: 'No property access assigned' });
      }

      const Property = require('../models/property');
      allowedProperties = await Property.findAll({
        where: { id: { [Op.in]: permission.properties } },
        attributes: ['id', 'name'],
      });
    }
    else {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!propertyId) {
      return res.status(200).json({
        allowedProperties,
        visits: [],
      });
    }

    const allowedPropertyIds = allowedProperties.map(p => p.id);
    if (!allowedPropertyIds.includes(Number(propertyId))) {
      return res.status(403).json({ message: 'No access to this property' });
    }

    let where = { propertyId };

    if (status) where.status = status;
    if (date) where.visitDate = date;

    const visits = await GuestVisit.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    await applyLazyExpiry(visits);

    await logApiCall(req, res, 200, 'Viewed property guest visits', 'guestVisit');

    res.status(200).json({
      allowedProperties,
      visits,
    });

  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Failed to fetch property visits', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAdminGuestVisits = async (req, res) => {
  try {
    const { propertyId, residentUserId, status, date } = req.query;

    let where = {};

    if (propertyId) where.propertyId = propertyId;
    if (residentUserId) where.residentUserId = residentUserId;
    if (status) where.status = status;
    if (date) where.visitDate = date;

    const visits = await GuestVisit.findAll({
      where,
      include: [
        {
          model: User,
          as: 'resident',
          attributes: ['id', 'fullName', 'email', 'phone'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    await applyLazyExpiry(visits);

    await logApiCall(
      req,
      res,
      200,
      'Viewed admin guest visit report',
      'guestVisit'
    );

    res.status(200).json({ visits });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, 'Failed admin visit report', 'guestVisit');
    res.status(500).json({ message: 'Internal server error' });
  }
};