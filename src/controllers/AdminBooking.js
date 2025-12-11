const sequelize = require('../config/database');
const Booking=require('../models/bookRoom');
const Rooms=require('../models/rooms');
const Property=require('../models/property');
const User=require('../models/user');
const PropertyRateCard = require("../models/propertyRateCard");
const { Op } = require('sequelize');
const Inventory = require("../models/inventory");
const moment = require('moment');


//get all booking for admin
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
    ]
    })

    res.status(200).json({ booking });
  }catch(err){
    console.log("error",err);
    return res.status(500).json({message:"Internal server error"});
  }

} 

//approve booking request
exports.approveBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Rooms, as: "room" }]
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 🚨 BLOCK APPROVAL IF NO ROOM ASSIGNED
    if (!booking.roomId) {
      return res.status(400).json({
        message: "Cannot approve booking without assigning a room first."
      });
    }

    // Update status
    booking.status = "approved";
    await booking.save();

    // Update room status based on capacity
    const room = await Rooms.findByPk(booking.roomId);

    const activeBookings = await Booking.count({
      where: {
        roomId: room.id,
        status: { [Op.in]: ["approved", "active"] }
      }
    });

    room.status = activeBookings >= room.capacity ? "booked" : "available";
    await room.save();

    res.status(200).json({
      message: "Booking approved successfully",
      booking
    });

  } catch (err) {
    console.error("approveBooking error:", err);
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
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // 1️⃣ Update booking status
    booking.status = "rejected";
    await booking.save();

    // 2️⃣ Only update room if roomId exists
    if (booking.roomId) {
      const room = await Rooms.findByPk(booking.roomId);

      const activeBookings = await Booking.count({
        where: {
          roomId: room.id,
          status: { [Op.in]: ["approved", "active"] }
        }
      });

      room.status = activeBookings > 0 ? "booked" : "available";
      await room.save();
    }

    res.status(200).json({
      message: "Booking rejected",
      booking,
    });

  } catch (error) {
    console.error("rejectBooking error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body || {};

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking already cancelled or completed" });
    }

    booking.status = "cancelled";
    booking.cancelReason = reason || null;
    await booking.save();

    if (booking.roomId) {
      const room = await Rooms.findByPk(booking.roomId);
      if (room) {
        const active = await Booking.count({
          where: {
            roomId: room.id,
            status: { [Op.in]: ["approved", "active"] }
          }
        });

        room.status = active > 0 ? "booked" : "available";
        await room.save();
      }
    }

    return res.status(200).json({
      message: "Booking cancelled successfully",
      booking
    });

  } catch (err) {
    console.error("cancelBooking error:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
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
      return res.status(404).json({ message: "Booking not found" });
    }

    const room = await Rooms.findByPk(roomId, {
      transaction: t,
      lock: t.LOCK.UPDATE, // also lock the room row
    });

    if (!room) {
      await t.rollback();
      return res.status(404).json({ message: "Room not found" });
    }

    // Validate room belongs to booking's property
    if (booking.rateCardId) {
      const rateCard = await PropertyRateCard.findByPk(booking.rateCardId, {
        transaction: t,
      });

      if (rateCard && rateCard.propertyId !== room.propertyId) {
        await t.rollback();
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
      return res.status(400).json({ message: "Room is already full" });
    }

    // ASSIGN ROOM
    booking.roomId = room.id;
    await booking.save({ transaction: t });

    // UPDATE ROOM STATUS
    const newActiveCount = activeCount + 1;
    room.status = newActiveCount >= room.capacity ? "booked" : "available";
    await room.save({ transaction: t });

    await t.commit();
    return res.json({ message: "Room assigned successfully", booking });
  } catch (err) {
    await t.rollback();
    console.error("Assign Room Error:", err);
    return res.status(500).json({ message: "Failed to assign room", error: err.message });
  }
};
// NEW/REPLACE: Assign inventory to booking (atomic + property & availability checks)
exports.assignInventory = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { bookingId } = req.params;
    const { inventoryIds = [] } = req.body;

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

    // Fetch room + property (no lock)
    const room = await Rooms.findByPk(booking.roomId, {
      include: [{ model: Property, as: "property" }]
    });

    if (!room) {
      await t.rollback();
      return res.status(400).json({ message: "Room not found" });
    }

    const roomId = room.id;
    const propertyId = room.propertyId;

    // Validate items belong to this exact room
    const items = await Inventory.findAll({
      where: {
        id: inventoryIds,
        status: "Available",
        roomId: roomId,         // room-level inventory only
        isCommonAsset: false    // Common assets cannot be assigned
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (items.length !== inventoryIds.length) {
      const foundIds = items.map(i => i.id);
      const invalid = inventoryIds.filter(id => !foundIds.includes(id));

      await t.rollback();
      return res.status(400).json({
        message: "Some items are not available for this room",
        invalidItems: invalid
      });
    }

    // Mark items as allocated
    await Inventory.update(
      { status: "Allocated" },
      { where: { id: inventoryIds }, transaction: t }
    );

    // Save assigned items into Booking JSON array
    booking.assignedItems = [
      ...new Set([...(booking.assignedItems || []), ...inventoryIds])
    ];

    await booking.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
      message: "Inventory assigned successfully",
      assignedInventory: inventoryIds
    });

  } catch (err) {
    await t.rollback();
    console.error("Assign Inventory Error:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};