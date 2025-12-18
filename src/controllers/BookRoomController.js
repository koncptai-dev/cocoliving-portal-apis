const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const User = require('../models/user');
const PropertyRateCard = require("../models/propertyRateCard");
const { logActivity } = require("../helpers/activityLogger");
const { Op } = require('sequelize');
const moment = require('moment');
const { Property } = require('../models');
const e = require('cors');
const { logApiCall } = require("../helpers/auditLog");


//create booking for user
// ⚠️⚠️this logic is moved to BookingPayment initiate then booking is created at phonepewebhook arrival
// so previously what was /api/book-room/add is now a flow of /api/booking-payment/initiate -> /api/payments-webhook
// this function will be deprecated
exports.createBooking = async (req, res) => {
  try {

    const { rateCardId, checkInDate, duration } = req.body;
    const userId = req.user.id;
    const rateCard = await PropertyRateCard.findByPk(rateCardId);
    if (!rateCard) {
      await logApiCall(req, res, 404, "Failed to create booking - rate card not found", "booking");
      return res.status(404).json({ message: "Rate card not found" });
    }
    
    if (!duration || duration <= 0) {
      await logApiCall(req, res, 400, "Failed to create booking - invalid duration", "booking");
      return res.status(400).json({ message: "Please provide a valid duration in months" });
    }
    
    let checkInDateFormatted = moment(checkInDate, ["DD-MM-YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD");
    const checkOutDateFormatted = moment(checkInDateFormatted).add(duration, "months").format("YYYY-MM-DD");


    const overlappingBooking = await Booking.findOne({
      where: {
        userId, status: { [Op.in]: ["approved", "active", "pending"] }, [Op.or]: [
          {
            checkOutDate: { [Op.is]: null }, // open-ended booking
            checkInDate: { [Op.lte]: checkOutDateFormatted || checkInDateFormatted }
          },
          {
            checkOutDate: { [Op.gte]: checkInDateFormatted },
            checkInDate: { [Op.lte]: checkOutDateFormatted || checkInDateFormatted }
          }
        ]
      }
    })
    if (overlappingBooking) {
      await logApiCall(req, res, 400, "Failed to create booking - overlapping booking exists", "booking");
      return res.status(400).json({
        message: "You already have an active booking during this period",
        existingBooking: overlappingBooking,
      });
    }
    const securityDeposit = rateCard.rent*2;
    const totalAmount = rateCard.rent*duration+securityDeposit;
    const booking = await Booking.create({
      userId,
      rateCardId,
      roomType: rateCard.roomType,
      propertyId: rateCard.propertyId,
      checkInDate: checkInDateFormatted,
      checkOutDate: checkOutDateFormatted,
      duration,
      monthlyRent: rateCard.rent,
      status: "pending",
      totalAmount:totalAmount,
      remainingAmount:totalAmount,
    });

    
    //for log activity getting user details
    const user = await User.findByPk(req.user.id, { attributes: ['fullName'] });
    if (!user) {
      await logApiCall(req, res, 404, "Failed to create booking - user not found", "booking");
      return res.status(404).json({ message: "User not found" });
    }

    //log activity after successful booking creation
    await logActivity({
      userId: req.user.id,
      name: user.fullName,
      role: req.user.role,
      action: "New Booking",
      entityType: "Booking",
      entityId: booking.id,
      details: { property: rateCard.propertyId,
        roomType: rateCard.roomType,
        duration },
    });

    await logApiCall(req, res, 201, `Created new booking (ID: ${booking.id})`, "booking", booking.id);
    res.status(201).json({ message: "Booking successful", booking });
  } catch (error) {
    console.error(error);
    await logApiCall(req, res, 500, "Error occurred while creating booking", "booking");
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

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

exports.cancelBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    // ..find booking
    const booking = await Booking.findOne({
      where: { id: bookingId, userId },
      include: [{ model: Rooms, as: "room" }]
    });

    if (!booking) {
      await logApiCall(req, res, 404, `Cancelled booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }
    // agar already cancelled ya completed hai
    if (["cancelled", "completed"].includes(booking.status)) {
      await logApiCall(req, res, 400, `Cancelled booking - already cancelled or completed (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(400).json({ message: "Booking is already cancelled or completed" });
    }

    // cancel the booking
    booking.status = "cancelled";
    await booking.save();

    await logApiCall(req, res, 200, `Cancelled booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    return res.status(200).json({ message: "Booking cancelled successfully", booking });
  } catch (error) {
    console.error("Cancel booking error:", error);
    await logApiCall(req, res, 500, "Error occurred while cancelling booking", "booking", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }

}
