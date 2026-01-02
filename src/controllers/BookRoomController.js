const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const PropertyRateCard = require("../models/propertyRateCard");
const moment = require('moment');
const Property = require('../models/property');
const { logApiCall } = require("../helpers/auditLog");
const { getCancellationMeta } = require("../helpers/cancellation");

exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows: bookings, count } = await Booking.findAndCountAll({
      where: { userId },
      include: [{ model: Rooms, as: "room", include: [{ model: Property, as: "property" }] },
    {
      model: PropertyRateCard,
      as: "rateCard",     
      include: [{ model: Property, as: "property" }] 
    }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    })

    const today = moment().startOf('day');
     const hasActiveBooking = bookings.some(b =>
      ["active", "approved"].includes(b.status) &&
      moment(b.checkInDate).isSameOrBefore(today) &&
      moment(b.checkOutDate).isSameOrAfter(today)
    );
    const formattedBookings = bookings.map(b => {
      const checkIn = moment(b.checkInDate);
      let displayStatus = b.status;

      // If pending + check-in is in future → mark as upcoming for frontend
      if (b.status === 'pending' && checkIn.isAfter(today) && hasActiveBooking) {
        displayStatus = 'upcoming';
      }

      return {
        ...b.toJSON(),
        displayStatus
      };
    });
    const totalPages = Math.ceil(count / limit);
    await logApiCall(req, res, 200, "Viewed user bookings list", "booking");
    res.status(200).json({ bookings: formattedBookings, currentPage: page, totalPages, totalBookings: count });
  }
  catch (err) {
    console.log("error", err);
    await logApiCall(req, res, 500, "Error occurred while fetching user bookings", "booking");
    return res.status(500).json({ message: "Internal server error" });
  }
}

exports.requestCancellation = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const userId = req.user.id;
    const { reason } = req.body || {};

    const booking = await Booking.findOne({
      where: { id: bookingId, userId },
      include: [{ model: Rooms, as: "room" }]
    });

    if (!booking) {
      await logApiCall(req, res, 404, `booking cancelllation request - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.status !== 'approved') {
      return res.status(400).json({
        message: "You can only request cancellation for Approved boookings.",
      });
    }

    if (booking.cancelRequestStatus === 'PENDING') {
      return res.status(400).json({ message: "Cancellation request already pending",});
    }

    const { effectiveCheckOutDate } = getCancellationMeta(booking);
    booking.cancelRequestStatus = 'PENDING';
    booking.userCancelReason = reason || null;
    booking.cancelEffectiveCheckOutDate = effectiveCheckOutDate;
    await booking.save();

    await logApiCall(req, res, 200, `User requested cancellation for booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    return res.status(200).json({ message: "Cancellation request submitted for admin approval", booking, effectiveCheckOutDate,});
  } catch (error) {
    console.error("Request Booking Cancellation error:", error);
    await logApiCall(req, res, 500, "Error occurred while processing booking cancellation request", "booking", parseInt(req.params.bookingId) || 0);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
}
