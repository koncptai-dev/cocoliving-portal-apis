// const sequelize = require('../config/database');
// const Booking=require('../models/bookRoom');
// const Rooms=require('../models/rooms');
// const Property=require('../models/property');
// const User=require('../models/user');
// const PropertyRateCard = require("../models/propertyRateCard");
// const { Op } = require('sequelize');
// const Inventory = require("../models/inventory");
// const moment = require('moment');
// const { logApiCall } = require("../helpers/auditLog");


// //get all booking for admin
// exports.getAllBookings=async(req,res)=>{
//   try{
//     const booking=await Booking.findAll({
//       include:[{
//         model:User,as:'user',attributes:["id","fullName","email","phone","gender"]
//       },{model:Rooms,as: "room",attributes:["id","roomNumber"], include: [{ model: Property, as: 'property' }]},
//     {
//       model: PropertyRateCard,
//       as: "rateCard",     
//       include: [{ model: Property, as: "property" }] 
//     }
//     ]
//     })

//     await logApiCall(req, res, 200, "Viewed all bookings list", "booking");
//     res.status(200).json({ booking });
//   }catch(err){
//     console.log("error",err);
//     await logApiCall(req, res, 500, "Error occurred while fetching all bookings", "booking");
//     return res.status(500).json({message:"Internal server error"});
//   }

// } 

// //approve booking request
// exports.approveBooking = async (req, res) => {
//   try {
//     const { bookingId } = req.params;

//     const booking = await Booking.findByPk(bookingId, {
//       include: [{ model: Rooms, as: "room" }]
//     });

//     if (!booking) {
//       await logApiCall(req, res, 404, `Approved booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     // 🚨 BLOCK APPROVAL IF NO ROOM ASSIGNED
//     if (!booking.roomId) {
//       await logApiCall(req, res, 400, `Approved booking - no room assigned (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({
//         message: "Cannot approve booking without assigning a room first."
//       });
//     }

//     // Update status
//     booking.status = "approved";
//     await booking.save();

//     // Update room status based on capacity
//     const room = await Rooms.findByPk(booking.roomId);

//     const activeBookings = await Booking.count({
//       where: {
//         roomId: room.id,
//         status: { [Op.in]: ["approved", "active"] }
//       }
//     });

//     room.status = activeBookings >= room.capacity ? "booked" : "available";
//     await room.save();

//     await logApiCall(req, res, 200, `Approved booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
//     res.status(200).json({
//       message: "Booking approved successfully",
//       booking
//     });

//   } catch (err) {
//     console.error("approveBooking error:", err);
//     await logApiCall(req, res, 500, "Error occurred while approving booking", "booking", parseInt(req.params.bookingId) || 0);
//     res.status(500).json({
//       message: "Internal server error",
//       error: err.message
//     });
//   }
// };

// exports.rejectBooking = async (req, res) => {
//   try {
//     const { bookingId } = req.params;

//     const booking = await Booking.findByPk(bookingId);
//     if (!booking) {
//       await logApiCall(req, res, 404, `Rejected booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     // 1️⃣ Update booking status
//     booking.status = "rejected";
//     await booking.save();

//     // 2️⃣ Only update room if roomId exists
//     if (booking.roomId) {
//       const room = await Rooms.findByPk(booking.roomId);

//       const activeBookings = await Booking.count({
//         where: {
//           roomId: room.id,
//           status: { [Op.in]: ["approved", "active"] }
//         }
//       });

//       room.status = activeBookings > 0 ? "booked" : "available";
//       await room.save();
//     }

//     await logApiCall(req, res, 200, `Rejected booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
//     res.status(200).json({
//       message: "Booking rejected",
//       booking,
//     });

//   } catch (error) {
//     console.error("rejectBooking error:", error);
//     await logApiCall(req, res, 500, "Error occurred while rejecting booking", "booking", parseInt(req.params.bookingId) || 0);
//     res.status(500).json({
//       message: "Server error",
//       error: error.message
//     });
//   }
// };

// exports.cancelBooking = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { reason } = req.body || {};

//     const booking = await Booking.findByPk(bookingId);

//     if (!booking) {
//       await logApiCall(req, res, 404, `Cancelled booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     if (["cancelled", "completed"].includes(booking.status)) {
//       await logApiCall(req, res, 400, `Cancelled booking - already cancelled or completed (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({ message: "Booking already cancelled or completed" });
//     }

//     booking.status = "cancelled";
//     booking.cancelReason = reason || null;
//     await booking.save();

//     if (booking.roomId) {
//       const room = await Rooms.findByPk(booking.roomId);
//       if (room) {
//         const active = await Booking.count({
//           where: {
//             roomId: room.id,
//             status: { [Op.in]: ["approved", "active"] }
//           }
//         });

//         room.status = active > 0 ? "booked" : "available";
//         await room.save();
//       }
//     }

//     await logApiCall(req, res, 200, `Cancelled booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
//     return res.status(200).json({
//       message: "Booking cancelled successfully",
//       booking
//     });

//   } catch (err) {
//     console.error("cancelBooking error:", err);
//     await logApiCall(req, res, 500, "Error occurred while cancelling booking", "booking", parseInt(req.params.bookingId) || 0);
//     return res.status(500).json({ message: "Internal server error", error: err.message });
//   }
// };

// exports.assignRoom = async (req, res) => {
//   const t = await sequelize.transaction();
//   try {
//     const { bookingId } = req.params;
//     const { roomId } = req.body;

//     // Lock the booking row to prevent race conditions
//     const booking = await Booking.findByPk(bookingId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE,
//     });

//     if (!booking) {
//       await t.rollback();
//       await logApiCall(req, res, 404, `Assigned room - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     const room = await Rooms.findByPk(roomId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE, // also lock the room row
//     });

//     if (!room) {
//       await t.rollback();
//       await logApiCall(req, res, 404, `Assigned room - room not found (ID: ${roomId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Room not found" });
//     }

//     // Validate room belongs to booking's property
//     if (booking.rateCardId) {
//       const rateCard = await PropertyRateCard.findByPk(booking.rateCardId, {
//         transaction: t,
//       });

//       if (rateCard && rateCard.propertyId !== room.propertyId) {
//         await t.rollback();
//         await logApiCall(req, res, 400, `Assigned room - room does not belong to booking's property (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
//         return res.status(400).json({
//           message: "Selected room does not belong to booking's property",
//         });
//       }
//     }

//     // CHECK ACTIVE BOOKINGS WITHOUT LOCKING (Postgres restriction)
//     const activeCount = await Booking.count({
//       where: {
//         roomId: room.id,
//         status: { [Op.in]: ["pending", "approved", "active"] },
//       },
//       transaction: t,
//     });

//     if (activeCount >= room.capacity) {
//       await t.rollback();
//       await logApiCall(req, res, 400, `Assigned room - room already full (Booking ID: ${bookingId}, Room ID: ${roomId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({ message: "Room is already full" });
//     }

//     // ASSIGN ROOM
//     booking.roomId = room.id;
//     await booking.save({ transaction: t });

//     // UPDATE ROOM STATUS
//     const newActiveCount = activeCount + 1;
//     room.status = newActiveCount >= room.capacity ? "booked" : "available";
//     await room.save({ transaction: t });
//     // AFTER room.save({ transaction: t });
//     const updatedBooking = await Booking.findByPk(booking.id, {
//       include: [
//         {
//           model: User,
//           as: 'user',
//           attributes: ['id', 'fullName', 'email', 'phone']
//         },
//         {
//           model: Rooms,
//           as: 'room',
//           attributes: ['id', 'roomNumber'],
//           include: [{ model: Property, as: 'property' }]
//         },
//         {
//           model: PropertyRateCard,
//           as: 'rateCard',
//           include: [{ model: Property, as: 'property' }]
//         }
//       ],
//       transaction: t
//     });
//     await t.commit();
//     await logApiCall(req, res, 200, `Assigned room ${roomId} to booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
//     return res.status(200).json({
//       message: "Room assigned successfully",
//       booking: updatedBooking
//     });
//   } catch (err) {
//     await t.rollback();
//     console.error("Assign Room Error:", err);
//     await logApiCall(req, res, 500, "Error occurred while assigning room", "booking", parseInt(req.params.bookingId) || 0);
//     return res.status(500).json({ message: "Failed to assign room", error: err.message });
//   }
// };
// // NEW/REPLACE: Assign inventory to booking (atomic + property & availability checks)
// exports.assignInventory = async (req, res) => {
//   const t = await sequelize.transaction();
//   try {
//     const { bookingId } = req.params;
//     const { inventoryIds = [] } = req.body;

//     const booking = await Booking.findByPk(bookingId, {
//       transaction: t,
//       lock: t.LOCK.UPDATE
//     });

//     if (!booking) {
//       await t.rollback();
//       await logApiCall(req, res, 404, `Assigned inventory - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     if (!booking.roomId) {
//       await t.rollback();
//       await logApiCall(req, res, 400, `Assigned inventory - room must be assigned first (ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({
//         message: "Room must be assigned before assigning inventory"
//       });
//     }

//     // Fetch room + property (no lock)
//     const room = await Rooms.findByPk(booking.roomId, {
//       include: [{ model: Property, as: "property" }]
//     });

//     if (!room) {
//       await t.rollback();
//       await logApiCall(req, res, 400, `Assigned inventory - room not found (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({ message: "Room not found" });
//     }

//     const roomId = room.id;
//     const propertyId = room.propertyId;

//     // Validate items belong to this exact room
//     const items = await Inventory.findAll({
//       where: {
//         id: inventoryIds,
//         status: "Available",
//         roomId: roomId,         // room-level inventory only
//         isCommonAsset: false    // Common assets cannot be assigned
//       },
//       transaction: t,
//       lock: t.LOCK.UPDATE
//     });

//     if (items.length !== inventoryIds.length) {
//       const foundIds = items.map(i => i.id);
//       const invalid = inventoryIds.filter(id => !foundIds.includes(id));

//       await t.rollback();
//       await logApiCall(req, res, 400, `Assigned inventory - some items not available (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
//       return res.status(400).json({
//         message: "Some items are not available for this room",
//         invalidItems: invalid
//       });
//     }

//     // Mark items as allocated
//     await Inventory.update(
//       { status: "Allocated" },
//       { where: { id: inventoryIds }, transaction: t }
//     );

//     // Save assigned items into Booking JSON array
//     booking.assignedItems = [
//       ...new Set([...(booking.assignedItems || []), ...inventoryIds])
//     ];

//     await booking.save({ transaction: t });

//     await t.commit();

//     await logApiCall(req, res, 200, `Assigned ${inventoryIds.length} inventory items to booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
//     return res.status(200).json({
//       message: "Inventory assigned successfully",
//       assignedInventory: inventoryIds
//     });

//   } catch (err) {
//     await t.rollback();
//     console.error("Assign Inventory Error:", err);
//     await logApiCall(req, res, 500, "Error occurred while assigning inventory", "booking", parseInt(req.params.bookingId) || 0);
//     return res.status(500).json({
//       message: "Internal server error",
//       error: err.message
//     });
//   }
// };

const sequelize = require('../config/database');
const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const Property = require('../models/property');
const User = require('../models/user');
const PropertyRateCard = require("../models/propertyRateCard");
const { Op } = require('sequelize');
const Inventory = require("../models/inventory");
const moment = require('moment');
const { logApiCall } = require("../helpers/auditLog");

// Import email utilities
const { sendEmail } = require('../utils/sendEmail');
const {
  bookingApprovedEmail,
  bookingCancelledByAdminEmail
} = require('../utils/emailTemplates/emailTemplates');

// Get all bookings for admin
exports.getAllBookings = async (req, res) => {
  try {
    const booking = await Booking.findAll({
      include: [{
        model: User, as: 'user', attributes: ["id", "fullName", "email", "phone", "gender"]
      }, {
        model: Rooms, as: "room", attributes: ["id", "roomNumber"], include: [{ model: Property, as: 'property' }]
      }, {
        model: PropertyRateCard,
        as: "rateCard",
        include: [{ model: Property, as: "property" }]
      }]
    });

    await logApiCall(req, res, 200, "Viewed all bookings list", "booking");
    res.status(200).json({ booking });
  } catch (err) {
    console.log("error", err);
    await logApiCall(req, res, 500, "Error occurred while fetching all bookings", "booking");
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Approve booking request
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

    // BLOCK APPROVAL IF NO ROOM ASSIGNED
    if (!booking.roomId) {
      await logApiCall(req, res, 400, `Approved booking - no room assigned (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(400).json({
        message: "Cannot approve booking without assigning a room first."
      });
    }

    // Update status
    booking.status = "approved";
    await booking.save();

    // Update room status based on capacity
    const room = await Rooms.findByPk(booking.roomId, {
      include: [{ model: Property, as: 'property' }]
    });

    const activeBookings = await Booking.count({
      where: {
        roomId: room.id,
        status: { [Op.in]: ["approved", "active"] }
      }
    });

    room.status = activeBookings >= room.capacity ? "booked" : "available";
    await room.save();

    // SEND APPROVAL EMAIL
    try {
      const user = await User.findByPk(booking.userId);

      if (user && room && room.property) {
        const emailTemplate = bookingApprovedEmail({
          userName: user.fullName,
          bookingId: booking.id,
          propertyName: room.property.name,
          roomNumber: room.roomNumber,
          checkInDate: booking.checkInDate,
        });

        await sendEmail({
          to: user.email,
          subject: 'Your Coco Living Booking is Approved! 🎉',
          html: emailTemplate.html,
          attachments: emailTemplate.attachments,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr.message);
      // Do not block approval if email fails
    }

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
      return res.status(404).json.json({ message: "Booking not found" });
    }

    // Update booking status
    booking.status = "rejected";
    await booking.save();

    // Only update room if roomId exists
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

    // SEND REJECTION EMAIL
    try {
      const user = await User.findByPk(booking.userId);

      if (user) {
        const emailTemplate = bookingCancelledByAdminEmail({
          userName: user.fullName,
          bookingId: booking.id,
          reason: 'Your booking could not be approved due to availability or verification issues.',
        });

        await sendEmail({
          to: user.email,
          subject: 'Update on Your Coco Living Booking',
          html: emailTemplate.html,
          attachments: emailTemplate.attachments,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr.message);
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
  try {
    const { bookingId } = req.params;
    const { reason } = req.body || {};

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      await logApiCall(req, res, 404, `Cancelled booking - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      await logApiCall(req, res, 400, `Cancelled booking - already cancelled or completed (ID: ${bookingId})`, "booking", parseInt(bookingId));
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

    // SEND CANCELLATION EMAIL
    try {
      const user = await User.findByPk(booking.userId);

      if (user) {
        const emailTemplate = bookingCancelledByAdminEmail({
          userName: user.fullName,
          bookingId: booking.id,
          reason: booking.cancelReason || 'Your booking has been cancelled by the admin team.',
        });

        await sendEmail({
          to: user.email,
          subject: 'Your Coco Living Booking Has Been Cancelled',
          html: emailTemplate.html,
          attachments: emailTemplate.attachments,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send cancellation email:', emailErr.message);
    }

    await logApiCall(req, res, 200, `Cancelled booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    return res.status(200).json({
      message: "Booking cancelled successfully",
      booking
    });

  } catch (err) {
    console.error("cancelBooking error:", err);
    await logApiCall(req, res, 500, "Error occurred while cancelling booking", "booking", parseInt(req.params.bookingId) || 0);
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
    const { inventoryIds = [] } = req.body;

    const booking = await Booking.findByPk(bookingId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!booking) {
      await t.rollback();
      await logApiCall(req, res, 404, `Assigned inventory - booking not found (ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.roomId) {
      await t.rollback();
      await logApiCall(req, res, 400, `Assigned inventory - room must be assigned first (ID: ${bookingId})`, "booking", parseInt(bookingId));
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
      await logApiCall(req, res, 400, `Assigned inventory - room not found (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
      return res.status(400).json({ message: "Room not found" });
    }

    const roomId = room.id;
    const propertyId = room.propertyId;

    // Validate items belong to this exact room
    const items = await Inventory.findAll({
      where: {
        id: inventoryIds,
        status: "Available",
        roomId: roomId,
        isCommonAsset: false
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (items.length !== inventoryIds.length) {
      const foundIds = items.map(i => i.id);
      const invalid = inventoryIds.filter(id => !foundIds.includes(id));

      await t.rollback();
      await logApiCall(req, res, 400, `Assigned inventory - some items not available (Booking ID: ${bookingId})`, "booking", parseInt(bookingId));
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

    await logApiCall(req, res, 200, `Assigned ${inventoryIds.length} inventory items to booking (ID: ${bookingId})`, "booking", parseInt(bookingId));
    return res.status(200).json({
      message: "Inventory assigned successfully",
      assignedInventory: inventoryIds
    });

  } catch (err) {
    await t.rollback();
    console.error("Assign Inventory Error:", err);
    await logApiCall(req, res, 500, "Error occurred while assigning inventory", "booking", parseInt(req.params.bookingId) || 0);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};