const sequelize = require('../config/database');
const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const User = require('../models/user');
const { logActivity } = require("../helpers/activityLogger");
const { Op } = require('sequelize');
const moment = require('moment');
const { Property } = require('../models');
const e = require('cors');


//create booking for user
exports.createBooking = async (req, res) => {
  try {

    const { roomId, checkInDate, duration } = req.body;
    const userId = req.user.id;

    let checkInDateFormatted = moment(checkInDate, ["DD-MM-YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD");

    if (!duration || duration <= 0) {
      return res.status(400).json({ message: "Please provide a valid duration in months" });
    }

    const checkOutDateFormatted = moment(checkInDateFormatted).add(duration, "months").format("YYYY-MM-DD");

    //check room exist
    const room = await Rooms.findByPk(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const overlappingBooking = await Booking.findOne({
      where: {
        userId, status: ["approved", "active", "pending"], [Op.or]: [
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
      return res.status(400).json({
        message: "You already have an active booking during this period",
        existingBooking: overlappingBooking,
      });
    }

    //check active bookings for this room
    const activeBookings = await Booking.count({
      where: { roomId, status: { [Op.in]: ["pending", "upcoming", "approved", "active"] } }
    })

    //if already full
    if (activeBookings >= room.capacity) {
      return res.status(400).json({ message: "Room is fully booked" });
    }

    const totalRent = room.monthlyRent * duration;
    const totalPrice = totalRent + room.depositAmount;

    const booking = await Booking.create({
      userId,
      roomId,
      checkInDate: checkInDateFormatted,
      checkOutDate: checkOutDateFormatted,
      duration,
      monthlyRent: room.monthlyRent,
      depositAmount: room.depositAmount,
      status: "pending",
    });

    //  recalc occupancy and update room status
    const currentBookings = await Booking.count({
      where: { roomId, status: { [Op.in]: ["pending", "approved", "active"] } }
    });
    room.status = currentBookings >= room.capacity ? "booked" : "available";
    await room.save();

    //for log activity getting user details
    const user = await User.findByPk(req.user.id, { attributes: ['fullName'] });
    if (!user) { return res.status(404).json({ message: "User not found" }); }

    //log activity after successful booking creation
    await logActivity({
      userId: req.user.id,
      name: user.fullName,
      role: req.user.role,
      action: "New Booking",
      entityType: "Booking",
      entityId: booking.id,
      details: { roomNumber: room.roomNumber, duration },
    });

    res.status(201).json({ message: "Booking successful", booking });
  } catch (error) {
    console.error(error);
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
      include: [{ model: Rooms, as: "room", include: [{ model: Property, as: "property" }] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    })

    const today = moment().startOf('day');
    const formattedBookings = bookings.map(b => {
      const checkIn = moment(b.checkInDate);
      let displayStatus = b.status;

      // If pending + check-in is in future → mark as upcoming for frontend
      if (b.status === 'pending' && checkIn.isAfter(today)) {
        displayStatus = 'upcoming';
      }

      return {
        ...b.toJSON(),
        displayStatus
      };
    });
    const totalPages = Math.ceil(count / limit);
    res.status(200).json({ bookings: formattedBookings, currentPage: page, totalPages, totalBookings: count });
  }
  catch (err) {
    console.log("error", err);
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
      return res.status(404).json({ message: "Booking not found" });
    }
    // agar already cancelled ya completed hai
    if (["cancelled", "completed"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking is already cancelled or completed" });
    }

    // cancel the booking
    booking.status = "cancelled";
    await booking.save();

    return res.status(200).json({ message: "Booking cancelled successfully", booking });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }

}
