const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { logApiCall } = require("../helpers/auditLog");
const moment = require('moment');
const { logActivity } = require('../helpers/activityLogger');

const Booking=require('../models/bookRoom');
const Rooms=require('../models/rooms');
const Property=require('../models/property');
const User=require('../models/user');
const PropertyRateCard = require("../models/propertyRateCard");
const BookingExtension = require('../models/bookingExtension');
const Inventory = require("../models/inventory");
const Contract = require('../models/contract');
const PaymentTransaction = require('../models/paymentTransaction');
const { sendPushNotification } = require("../helpers/notificationHelper");
const { removeUserFromRoom, addUserToRoom } = require('../utils/aliste/alisteApi');
const BookingOnboarding = require("../models/bookingOnboarding");
const DepositDeduction = require('../models/depositDeduction');
const RoomTransfer = require('../models/roomTransfer');

const releaseInventoryForBooking = async (booking, transaction = null) => {
  if (!booking.assignedItems || booking.assignedItems.length === 0) return;

  await Inventory.update(
    { status: "Available" },
    {
      where: { id: booking.assignedItems },
      transaction
    }
  );
  if (booking.assignedItems.length > 0) {
    booking.assignedItems = [];
    await booking.save({ transaction });
  }
};

//for notification application side
async function notifyBookingUser(booking) {
  if (!booking.userId) return;

  const user = await User.findByPk(booking.userId);
  if (!user || !user.fcmToken) return;

  const roomNumber = booking.room?.roomNumber || "your booked room";

  await sendPushNotification(
    user.id,
    "Booking Approved",
    `Your booking for room ${roomNumber} has been approved by admin Please Sign the Contract.`,
    { bookingId: booking.id.toString(), type: "booking" },
    "booking"
  );
}

exports.getAllBookings=async(req,res)=>{
  try{
    const booking=await Booking.findAll({
      include:[{
        model:User,as:'user',attributes:["id","fullName","email","phone","gender"]
      },{model:Rooms,as: "room",attributes:["id","roomNumber"], include: [{ model: Property, as: 'property' }]},
    {
      model: PropertyRateCard,
      as: "rateCard",     
      include: [{ model: Property, as: "property" }] 
    }
    ],
    order: [["createdAt", "DESC"]],
    })

    await logApiCall(req, res, 200, "Viewed all bookings list", "booking");
    res.status(200).json({ booking });
  }catch(err){
    console.log("error",err);
    await logApiCall(req, res, 500, "Error occurred while fetching all bookings", "booking");
    return res.status(500).json({message:"Internal server error"});
  }

} 

exports.approveBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Rooms, as: "room" }]
    });

    if (!booking) {
      await logApiCall(req, res, 404, `Approved booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.roomId) {
      await logApiCall(req, res, 400, `Approved booking - no room assigned (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(400).json({
        message: "Cannot approve booking without assigning a room first."
      });
    }

    booking.status = "approved";
    await booking.save();

    const room = await Rooms.findByPk(booking.roomId);

    const activeBookings = await Booking.count({
      where: {
        roomId: room.id,
        status: { [Op.in]: ["approved", "active"] }
      }
    });

    room.status = activeBookings >= room.capacity ? "booked" : "available";
    await room.save();
    
    //notification send 
    await notifyBookingUser(booking);
    
    await logApiCall(req, res, 200, `Approved booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    res.status(200).json({
      message: "Booking approved successfully",
      booking
    });

  } catch (err) {
    console.error("approveBooking error:", err);
    await logApiCall(req, res, 500, "Error occurred while approving booking", "booking", parseInt(req.params.bookingId) || 0);
    res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};

exports.rejectBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      await logApiCall(req, res, 404, `Rejected booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.status = "rejected";
    await booking.save();
    await releaseInventoryForBooking(booking);

    if (booking.roomId) {
      const room = await Rooms.findByPk(booking.roomId);

      const activeBookings = await Booking.count({
        where: {
          roomId: room.id,
          status: { [Op.in]: ["approved", "active"] }
        }
      });

      room.status = activeBookings >= room.capacity ? "booked" : "available";
      await room.save();
    }

    await logApiCall(req, res, 200, `Rejected booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    res.status(200).json({
      message: "Booking rejected",
      booking,
    });

  } catch (error) {
    console.error("rejectBooking error:", error);
    await logApiCall(req, res, 500, "Error occurred while rejecting booking", "booking", parseInt(req.params.bookingId) || 0);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

exports.cancelBooking = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const { bookingId } = req.params;
    const { reason } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        message: "Cancellation reason is required"
      });
    }

    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!booking) {
      await logApiCall(req, res, 404, `Cancelled booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      await logApiCall(req, res, 400, `Cancelled booking - already cancelled or completed (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(400).json({ message: "Booking already cancelled or completed" });
    }

    booking.status = "cancelled";
    booking.adminCancelReason = reason.trim();
    await booking.save({transaction: t});
    await releaseInventoryForBooking(booking,t);
    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'email', 'phone', 'gender']
        },
        {
          model: Rooms,
          as: 'room',
          attributes: ['id', 'roomNumber'],
          include: [{ model: Property, as: 'property' }]
        },
        {
          model: PropertyRateCard,
          as: 'rateCard',
          include: [{ model: Property, as: 'property' }]
        }
      ]
    });
    if (booking.roomId) {
      const room = await Rooms.findByPk(booking.roomId);
      if (room) {
        const active = await Booking.count({
          where: {
            roomId: room.id,
            status: { [Op.in]: ["approved", "active"] }
          }
        });

        room.status = active >= room.capacity ? "booked" : "available";
        await room.save();
      }
    }

    if (
      !booking.removedUserFromAliste &&
      booking.alisteUserId
    ) {
      try {
        const [bookingUser, room] = await Promise.all([
          User.findByPk(booking.userId),
          Rooms.findByPk(booking.roomId),
        ]);

        if (room?.alisteRoomId) {
          await removeUserFromRoom({
            roomId: room.alisteRoomId,
            phoneNumber: bookingUser?.phone,
          });

          booking.removedUserFromAliste = true;

          await booking.save({ transaction: t });
        }
      } catch (error) {
        console.error(
          `Failed to remove booking ${booking.id} user from Aliste:`,
          error.message
        );
      }
    }
    await logApiCall(req, res, 200, `Cancelled booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    await t.commit();
    return res.status(200).json({
      message: "Booking cancelled successfully",
      booking: updatedBooking
    });

  } catch (err) {
    await t.rollback();
    console.error("cancelBooking error:", err);
    await logApiCall(req, res, 500, "Error occurred while cancelling booking", "booking", parseInt(req.params.bookingId) || 0);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

exports.approveCancellation = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { adminReason } = req.body || {};

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.cancelRequestStatus !== 'PENDING') {
      return res.status(400).json({
        message: "No pending cancellation request",
      });
    }

    booking.status = 'cancelled';
    booking.cancelRequestStatus = 'APPROVED';
    booking.adminCancelReason = adminReason || null;
    booking.checkOutDate = booking.cancelEffectiveCheckOutDate;
    await booking.save();
    await releaseInventoryForBooking(booking);
    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'email', 'phone', 'gender']
        },
        {
          model: Rooms,
          as: 'room',
          attributes: ['id', 'roomNumber'],
          include: [{ model: Property, as: 'property' }]
        },
        {
          model: PropertyRateCard,
          as: 'rateCard',
          include: [{ model: Property, as: 'property' }]
        }
      ]
    });
    if (booking.roomId) {
      const room = await Rooms.findByPk(booking.roomId);

      if (room) {
        const activeCount = await Booking.count({
          where: {
            roomId: room.id,
            status: { [Op.in]: ['approved', 'active'] },
          },
        });

        room.status =
          activeCount >= room.capacity ? 'booked' : 'available';

        await room.save();
      }
    }
    if (
      !booking.removedUserFromAliste &&
      booking.alisteUserId
    ) {
      try {
        const [bookingUser, room] = await Promise.all([
          User.findByPk(booking.userId),
          Rooms.findByPk(booking.roomId),
        ]);

        if (room?.alisteRoomId) {
          await removeUserFromRoom({
            roomId: room.alisteRoomId,
            userId: booking.alisteUserId,
            phone: bookingUser?.phone,
          });

          booking.removedUserFromAliste = true;

          await booking.save({ transaction: t });
        }
      } catch (error) {
        console.error(
          `Failed to remove booking ${booking.id} user from Aliste:`,
          error.message
        );
      }
    }
    await logApiCall(
      req,
      res,
      200,
      `Admin approved cancellation for booking ${booking.id}`,
      "booking",
      booking.id
    );

    return res.json({
      message: "Cancellation approved",
      booking: updatedBooking,
    });

  } catch (err) {
    console.error("approveCancellation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.rejectCancellation = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.cancelRequestStatus !== 'PENDING') {
      return res.status(400).json({
        message: "No pending cancellation request",
      });
    }

    booking.cancelRequestStatus = 'REJECTED';
    await booking.save();
    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'email', 'phone', 'gender']
        },
        {
          model: Rooms,
          as: 'room',
          attributes: ['id', 'roomNumber'],
          include: [{ model: Property, as: 'property' }]
        },
        {
          model: PropertyRateCard,
          as: 'rateCard',
          include: [{ model: Property, as: 'property' }]
        }
      ]
    });
    await logApiCall(
      req,
      res,
      200,
      `Admin rejected cancellation for booking ${booking.id}`,
      "booking",
      booking.id
    );

    return res.json({
      message: "Cancellation request rejected",
      booking: updatedBooking,
    });

  } catch (err) {
    console.error("rejectCancellation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.assignRoom = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bookingId } = req.params;
    const { roomId } = req.body;

    // Lock the booking row to prevent race conditions
    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      await t.rollback();
      await logApiCall(req, res, 404, `Assigned room - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    const room = await Rooms.findByPk(roomId, {
      transaction: t,
      lock: t.LOCK.UPDATE, // also lock the room row
    });

    if (!room) {
      await t.rollback();
      await logApiCall(req, res, 404, `Assigned room - room not found (ID: ${roomId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Room not found" });
    }

    // Validate room belongs to booking's property
    if (booking.rateCardId) {
      const rateCard = await PropertyRateCard.findByPk(booking.rateCardId, {
        transaction: t,
      });

      if (rateCard && rateCard.propertyId !== room.propertyId) {
        await t.rollback();
        await logApiCall(req, res, 400, `Assigned room - room does not belong to booking's property (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
        return res.status(400).json({
          message: "Selected room does not belong to booking's property",
        });
      }
    }

    // CHECK ACTIVE BOOKINGS WITHOUT LOCKING (Postgres restriction)
    const activeCount = await Booking.count({
      where: {
        roomId: room.id,
        status: { [Op.in]: ["pending", "approved", "active"] },
      },
      transaction: t,
    });

    if (activeCount >= room.capacity) {
      await t.rollback();
      await logApiCall(req, res, 400, `Assigned room - room already full (Booking ID: ${bookingId}, Room ID: ${roomId})`, "booking", parseInt(bookingId));
      return res.status(400).json({ message: "Room is already full" });
    }

    // ASSIGN ROOM
    booking.roomId = room.id;
    await booking.save({ transaction: t });

    // UPDATE ROOM STATUS
    const newActiveCount = activeCount + 1;
    room.status = newActiveCount >= room.capacity ? "booked" : "available";
    await room.save({ transaction: t });
    // AFTER room.save({ transaction: t });
    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'email', 'phone']
        },
        {
          model: Rooms,
          as: 'room',
          attributes: ['id', 'roomNumber'],
          include: [{ model: Property, as: 'property' }]
        },
        {
          model: PropertyRateCard,
          as: 'rateCard',
          include: [{ model: Property, as: 'property' }]
        }
      ],
      transaction: t
    });
    await t.commit();
    await logApiCall(req, res, 200, `Assigned room ${roomId} to booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    return res.status(200).json({
      message: "Room assigned successfully",
      booking: updatedBooking
    });
  } catch (err) {
    await t.rollback();
    console.error("Assign Room Error:", err);
    await logApiCall(req, res, 500, "Error occurred while assigning room", "booking", parseInt(req.params.bookingId) || 0);
    return res.status(500).json({ message: "Failed to assign room", error: err.message });
  }
};

exports.assignInventory = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bookingId } = req.params;
    const { setNumber } = req.body;

    if (!setNumber) {
      await t.rollback();
      return res.status(400).json({ message: "setNumber is required" });
    }
    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.roomId) {
      await t.rollback();
      return res.status(400).json({
        message: "Room must be assigned before assigning inventory"
      });
    }

    const room = await Rooms.findByPk(booking.roomId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!room) {
      await t.rollback();
      return res.status(400).json({ message: "Room not found" });
    }

    // STEP 1: fetch ALL items of this set
    const items = await Inventory.findAll({
      where: {
        propertyId: room.propertyId,
        roomId: room.id,
        setNumber,
        isCommonAsset: false
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
      order: [["id", "ASC"]]
    });

    if (items.length === 0) {
      await t.rollback();
      return res.status(400).json({
        message: "Selected set has no inventory"
      });
    }

    // STEP 2: check if entire set is available
    const unavailable = items.filter(i => i.status !== "Available");

    if (unavailable.length > 0) {
      await t.rollback();
      return res.status(400).json({
        message: "Selected set is not fully available"
      });
    }

    const ids = items.map(i => i.id);

    // STEP 3: release old inventory (if reassigned)
    await releaseInventoryForBooking(booking, t);

    // STEP 4: allocate new set
    await Inventory.update(
      { status: "Allocated" },
      { where: { id: ids }, transaction: t }
    );

    // STEP 5: save assignment
    booking.assignedItems = ids;
    await booking.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
      message: "Inventory set assigned successfully",
      setNumber,
      assignedInventory: ids
    });

  } catch (err) {
    await t.rollback();
    console.error("Assign Set Error:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};

exports.getInventorySets = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;

    const items = await Inventory.findAll({
      where: {
        propertyId,
        roomId,
        isCommonAsset: false
      },
      attributes: ["id", "setNumber", "itemName", "status"],
      order: [["setNumber", "ASC"], ["id", "ASC"]]
    });

    const grouped = {};

    for (const item of items) {
      if (!grouped[item.setNumber]) {
        grouped[item.setNumber] = {
          setNumber: item.setNumber,
          items: [],
          isAvailable: true
        };
      }

      grouped[item.setNumber].items.push(item.itemName);

      if (item.status !== "Available") {
        grouped[item.setNumber].isAvailable = false;
      }
    }

    return res.json({
      sets: Object.values(grouped)
    });

  } catch (err) {
    console.error("Get Sets Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.getPendingBookingExtension = async(req,res) => {
  try {
    const { bookingId } = req.params;
    const extension = await BookingExtension.findOne({
      where: { status: 'pending' , bookingId : bookingId},
      include: [
        { model: Booking, as: 'booking' },
        { model: User, as: 'user' }
      ],
      order: [['createdAt', 'ASC']]
    });

    return res.json({ success: true, extension });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

exports.approveExtension = async (req, res) => {
  const { extensionId } = req.params;
  const id = extensionId;
  try {
    await sequelize.transaction(async (t) => {
      const extension = await BookingExtension.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!extension || extension.status !== 'pending') {
        throw new Error('Invalid extension state');
      }
      const booking = await Booking.findByPk(extension.bookingId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!booking) {
        throw new Error('Booking not found for extension');
      }
      booking.checkOutDate = extension.newCheckOutDate;
      booking.duration += extension.requestedMonths;
      booking.totalAmount += extension.amountRupees;
      await booking.save({ transaction: t });
      extension.status = 'approved';

      await extension.save({ transaction: t });
    });
    return res.json({ success: true, message: 'Extension approved' });

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.rejectExtension = async (req, res) => {
  const { extensionId } = req.params;
  const id = extensionId;

  try {
    const extension = await BookingExtension.findByPk(id);

    if (!extension || extension.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid extension state' });
    }

    extension.status = 'rejected';
    await extension.save();

    return res.json({ success: true, message: 'Extension rejected' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


exports.createBookingForOfflinePayments = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      userId,
      roomId,
      checkInDate,
      duration,
      bookingType,
      monthlyRent
    } = req.body;

    if (
      !userId ||
      !roomId ||
      !checkInDate ||
      !duration ||
      !bookingType
    ) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        message:
          "userId, roomId, checkInDate, duration, bookingType are required",
      });
    }

    if (
      monthlyRent !== undefined &&
      monthlyRent !== null &&
      (isNaN(Number(monthlyRent)) || Number(monthlyRent) <= 0)
    ) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "monthlyRent must be a positive number",
      });
    }

    const normalizedBookingType = bookingType.toUpperCase();

    if (!["BOOK", "PREBOOK"].includes(normalizedBookingType)) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        message: "bookingType must be BOOK or PREBOOK",
      });
    }

    const user = await User.findByPk(userId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const room = await Rooms.findByPk(roomId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!room) {
      await t.rollback();

      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const activeCount = await Booking.count({
      where: {
        roomId: room.id,
        status: {
          [Op.in]: ["pending", "approved", "active"],
        },
      },
      transaction: t,
    });

    if (activeCount >= room.capacity) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        message: "Room is already full",
      });
    }

    const rateCard = await PropertyRateCard.findOne({
      where: {
        propertyId: room.propertyId,
        roomType: room.roomType,
      },
      transaction: t,
    });

    if (!rateCard) {
      await t.rollback();

      return res.status(404).json({
        success: false,
        message: "Rate card not found",
      });
    }
    const checkOutDate = moment(checkInDate)
      .add(Number(duration), "months")
      .subtract(1, "day")
      .format("YYYY-MM-DD");
    const overlap = await Booking.findOne({
      where: {
        userId: userId,
        status: { [Op.in]: ['approved', 'active', 'pending'] },
        [Op.or]: [
          { checkOutDate: { [Op.is]: null }, checkInDate: { [Op.lte]: checkOutDate } },
          { checkOutDate: { [Op.gte]: checkInDate }, checkInDate: { [Op.lte]: checkOutDate } }
        ]
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (overlap) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        message: "User already has an active booking",
      });
    }

    

    const finalMonthlyRent =
      monthlyRent !== undefined &&
      monthlyRent !== null &&
      !isNaN(Number(monthlyRent))
        ? Number(monthlyRent)
        : room.monthlyRent;

    const totalAmount =
      finalMonthlyRent * Number(duration) + finalMonthlyRent * 2;

    const booking = await Booking.create(
      {
        propertyId: room.propertyId,
        userId,
        rateCardId: rateCard.id,

        roomType: room.roomType,
        roomId: room.id,

        assignedItems: [],

        checkInDate,
        checkOutDate,

        duration,

        monthlyRent: finalMonthlyRent,

        totalAmount,
        remainingAmount: totalAmount,

        bookingType: normalizedBookingType,

        paymentStatus: "INITIATED",

        status: "approved",

        bookingSource: "OFFLINE",

        onboardingStatus: "NOT_INITIATED",

        contractStatus: "NOT_SIGNED",
        adminContractStatus: "NOT_SIGNED",
      },
      { transaction: t }
    );

    const newActiveCount = activeCount + 1;

    room.status =
      newActiveCount >= room.capacity
        ? "booked"
        : "available";

    await room.save({ transaction: t });

    await logActivity({
      userId,
      name: user.fullName,
      role: user.role,
      action: "Offline Booking Created",
      entityType: "Booking",
      entityId: booking.id,
      details: {
        roomId: room.id,
        propertyId: room.propertyId,
      },
    });

    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Offline booking created successfully",
      booking,
    });

  } catch (err) {
    await t.rollback();

    console.error("Offline Booking Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

exports.updateOfflineBookingDuration = async (req, res) => {
  const t = await sequelize.transaction();
  let committed = false;

  try {
    const { bookingId } = req.params;
    const duration = Number(req.body?.duration);

    if (!Number.isInteger(duration) || duration <= 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "duration must be a positive whole number of months",
      });
    }

    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.bookingSource !== "OFFLINE") {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Only offline booking durations can be changed",
      });
    }

    if (["cancelled", "rejected", "completed"].includes(booking.status)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Duration cannot be changed for a closed booking",
      });
    }

    const contract = await Contract.findOne({
      where: { bookingId: booking.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const contractHasBeenSigned =
      booking.contractStatus === "SIGNED" ||
      booking.adminContractStatus === "SIGNED" ||
      Boolean(
        contract?.signedAt ||
        contract?.residentSignedAt ||
        contract?.adminSignedAt
      );

    if (contractHasBeenSigned) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Booking duration cannot be changed after the contract is signed",
      });
    }

    const successfulPayments = await PaymentTransaction.findAll({
      where: {
        bookingId: booking.id,
        status: "SUCCESS",
        type: { [Op.ne]: "REFUND" },
      },
      attributes: ["amount"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const paidAmount = successfulPayments.reduce(
      (total, payment) => total + Number(payment.amount || 0) / 100,
      0
    );
    const totalAmount = Number(booking.monthlyRent) * duration + Number(booking.monthlyRent) * 2;
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);

    booking.duration = duration;
    booking.checkOutDate = moment(booking.checkInDate)
      .add(duration, "months")
      .subtract(1, "day")
      .format("YYYY-MM-DD");
    booking.totalAmount = totalAmount;
    booking.remainingAmount = remainingAmount;
    booking.paymentStatus = remainingAmount === 0
      ? "COMPLETED"
      : paidAmount > 0
        ? "PARTIAL"
        : "INITIATED";
    await booking.save({ transaction: t });

    await t.commit();
    committed = true;

    try {
      await logActivity({
        userId: req.user?.id,
        name: req.user?.fullName,
        role: req.user?.role,
        action: "Offline Booking Duration Updated",
        entityType: "Booking",
        entityId: booking.id,
        details: { duration, totalAmount, remainingAmount },
      });
      await logApiCall(req, res, 200, `Updated offline booking duration (ID: ${booking.id})`, "booking", booking.id);
    } catch (auditError) {
      console.error("Unable to audit offline booking duration update:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Offline booking duration updated successfully",
      booking,
      payment: { paidAmount, totalAmount, remainingAmount },
    });
  } catch (err) {
    if (!committed) await t.rollback();
    console.error("Update offline booking duration error:", err);
    await logApiCall(req, res, 500, "Error occurred while updating offline booking duration", "booking", parseInt(req.params.bookingId) || 0);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getRoomTransferDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: BookingOnboarding, as: 'onboarding' },
        { model: Rooms, as: 'room' }
      ]
    });

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Only allow transfer when onboarding for current room is completed
    if (booking.onboardingStatus !== 'COMPLETED') {
      return res.status(400).json({ message: 'Room transfer allowed only after onboarding is completed for current room' });
    }

    // Fetch available rooms in same property excluding current room
    const availableRooms = await Rooms.findAll({
      where: {
        propertyId: booking.room?.propertyId || null,
        status: 'available',
        id: { [Op.ne]: booking.roomId }
      },
      attributes: ['id', 'roomNumber', 'roomType', 'floorNumber'],
      order: [['roomNumber', 'ASC']]
    });

    await logApiCall(
      req,
      res,
      200,
      `Viewed room transfer details for booking ${bookingId}`,
      'booking',
      parseInt(bookingId)
    );

    return res.status(200).json({
      bookingId: booking.id,
      room: booking.room || null,
      onboarding: booking.onboarding || null,
      assignedItems: booking.assignedItems || [],
      availableRooms
    });
  } catch (err) {
    console.error('getRoomTransferDetails error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getRoomTransferHistory = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const transfers = await RoomTransfer.findAll({
      where: { bookingId },
      include: [
        { model: Rooms, as: 'fromRoom', attributes: ['id', 'roomNumber', 'roomType', 'floorNumber'] },
        { model: Rooms, as: 'toRoom', attributes: ['id', 'roomNumber', 'roomType', 'floorNumber'] }
      ],
      order: [['transferDate', 'DESC']]
    });

    return res.status(200).json({
      bookingId: Number(bookingId),
      transfers
    });
  } catch (err) {
    console.error('getRoomTransferHistory error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.transferRoom = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bookingId } = req.params;
    const { newRoomId, transferDate, fines = [] } = req.body;

    if (!newRoomId) {
      await t.rollback();
      return res.status(400).json({ message: 'newRoomId is required' });
    }

    const booking = await Booking.findByPk(bookingId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Prevent transfer unless onboarding for current room is completed
    if (booking.onboardingStatus !== 'COMPLETED') {
      await t.rollback();
      return res.status(400).json({ message: 'Room transfer allowed only after onboarding is completed for current room' });
    }

    if (!booking.roomId) {
      await t.rollback();
      return res.status(400).json({ message: 'Booking has no assigned room' });
    }

    const oldRoom = await Rooms.findByPk(booking.roomId, { transaction: t, lock: t.LOCK.UPDATE });
    const newRoom = await Rooms.findByPk(newRoomId, { transaction: t, lock: t.LOCK.UPDATE });

    if (!newRoom) {
      await t.rollback();
      return res.status(404).json({ message: 'New room not found' });
    }

    // Check capacity
    const activeCount = await Booking.count({
      where: { roomId: newRoom.id, status: { [Op.in]: ['pending', 'approved', 'active'] } },
      transaction: t
    });

    if (activeCount >= newRoom.capacity) {
      await t.rollback();
      return res.status(400).json({ message: 'New room is full' });
    }

    const transferMoment = transferDate ? moment(transferDate) : moment();

    // Create deposit deduction records (if any)
    const createdDeductions = [];
    const createdFineTransactions = [];
    let totalFine = 0;
    for (const f of fines) {
      const amount = Number(f.amount) || 0;
      if (amount <= 0) continue;
      const dd = await DepositDeduction.create({
        bookingId: booking.id,
        amount,
        itemKey: f.itemKey || null,
        reason: f.reason || null,
        createdBy: req.user?.id || null
      }, { transaction: t });
      createdDeductions.push(dd);
      totalFine += amount;
      // Also record the fine as a payment transaction (offline fine)
      try {
        const merchantOrderId = `FINE-${booking.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const pt = await PaymentTransaction.create({
          bookingId: booking.id,
          userId: booking.userId,
          merchantOrderId,
          amount: Math.round(amount * 100), // store in paise
          type: 'OFFLINE',
          status: 'SUCCESS',
          paymentMode: 'OFFLINE',
          paymentDate: moment().format('YYYY-MM-DD'),
          adminNote: f.reason || 'Fine for damages',
          createdByAdminId: req.user?.id || null,
          meta: { itemKey: f.itemKey || null }
        }, { transaction: t });
        createdFineTransactions.push(pt);
      } catch (ptErr) {
        console.error('Failed to create fine payment transaction:', ptErr && ptErr.message ? ptErr.message : ptErr);
      }
    }

    // Release old inventory and clear assigned items (inventory typically tied to room)
    await releaseInventoryForBooking(booking, t);

    // Update booking in-place: change roomId to new room
    const previousRoomId = booking.roomId;
    booking.roomId = newRoom.id;
    booking.assignedItems = [];
    // Do NOT modify onboarding data here (business rule)
    await booking.save({ transaction: t });

    // Update room statuses (recompute)
    if (oldRoom) {
      const oldActive = await Booking.count({ where: { roomId: oldRoom.id, status: { [Op.in]: ['approved', 'active'] } }, transaction: t });
      oldRoom.status = oldActive >= oldRoom.capacity ? 'booked' : 'available';
      await oldRoom.save({ transaction: t });
    }

    const newActive = await Booking.count({ where: { roomId: newRoom.id, status: { [Op.in]: ['approved', 'active'] } }, transaction: t });
    newRoom.status = newActive >= newRoom.capacity ? 'booked' : 'available';
    await newRoom.save({ transaction: t });

    // Handle Aliste: remove from old room and add to new room
    try {
      const bookingUser = await User.findByPk(booking.userId, { transaction: t });
      if (oldRoom?.alisteRoomId && booking.alisteUserId && !booking.removedUserFromAliste) {
        await removeUserFromRoom({ roomId: oldRoom.alisteRoomId, phoneNumber: bookingUser?.phone });
        // mark removed from old room
        booking.removedUserFromAliste = true;
        await booking.save({ transaction: t });
      }

      if (newRoom?.alisteRoomId) {
        const payloadUserId = booking.alisteUserId || `USER_${booking.id}`;
        const payload = {
          roomId: newRoom.alisteRoomId,
          userId: payloadUserId,
          phoneNumber: bookingUser?.phone,
          firstName: bookingUser?.fullName?.split(' ')[0] || 'User',
          lastName: bookingUser?.fullName?.split(' ').slice(1).join(' ') || '',
          email: bookingUser?.email
        };
        const resp = await addUserToRoom(payload);
        if (resp && resp.success) {
          booking.alisteUserId = payloadUserId;
          booking.removedUserFromAliste = false;
          await booking.save({ transaction: t });
        } else {
          console.warn('Aliste add user failed:', resp && resp.raw ? resp.raw : resp);
        }
      }
    } catch (err) {
      console.error('Aliste transfer error:', err.message || err);
    }

    // Record room transfer history
    const transferRecord = await RoomTransfer.create({
      bookingId: booking.id,
      fromRoomId: previousRoomId,
      toRoomId: newRoom.id,
      transferDate: transferMoment.format('YYYY-MM-DD'),
      fines: createdDeductions.map(d => d.id),
      totalFine,
      createdBy: req.user?.id || null
    }, { transaction: t });

    await t.commit();

    const result = await Booking.findByPk(booking.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'phone'] },
        { model: Rooms, as: 'room', attributes: ['id', 'roomNumber'], include: [{ model: Property, as: 'property' }] },
        { model: PropertyRateCard, as: 'rateCard', include: [{ model: Property, as: 'property' }] }
      ]
    });

    return res.status(200).json({ message: 'Room transferred', booking: result, deductions: createdDeductions, fineTransactions: createdFineTransactions, totalFine, transferRecord });
  } catch (err) {
    await t.rollback();
    console.error('transferRoom error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};