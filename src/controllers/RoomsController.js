const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const Inventory  = require('../models/inventory');
const { generateInventoryCode } = require('../helpers/InventoryCode');
const { logApiCall } = require("../helpers/auditLog");
const fs = require('fs');
const path = require('path');

const { Op } = require('sequelize');


//Add Rooms  for admin
exports.AddRooms = async (req, res) => {
    try {
        const { propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent,preferredUserType, description, status } = req.body;

        //check property exist or not
        const property = await Property.findByPk(propertyId);
        if (!property) {
            await logApiCall(req, res, 404, `Added room - property not found (ID: ${propertyId})`, "room");
            return res.status(404).json({ message: "Property not found" });
        }

        //check rooms are exist -> unique room number
        const existingRoom = await Rooms.findOne({ where: { roomNumber, propertyId } });
        if (existingRoom) {
            await logApiCall(req, res, 400, `Added room - room already exists (${roomNumber})`, "room");
            return res.status(400).json({ message: "Room already exists for this property" });
        }

        const finalStatus = status === "available" ? "available" : "unavailable";

        const newRoom = await Rooms.create({
            propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount: monthlyRent * 2, preferredUserType, description, status:finalStatus
        })        

        await logApiCall(req, res, 201, `Added new room: ${roomNumber} (ID: ${newRoom.id})`, "room", newRoom.id);
        return res.status(201).json({ message: 'Rooms added successfully', room: newRoom })

    } catch (err) {
        console.log("error->", err
        );
        await logApiCall(req, res, 500, "Error occurred while adding room", "room");
        return res.status(500).json({ message: "Internal server error" });
    }
}

// Edit Rooms
exports.EditRooms = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;

        //find existing room
        const room = await Rooms.findByPk(id);
        if (!room) {
            await logApiCall(req, res, 404, `Updated room - room not found (ID: ${id})`, "room", parseInt(id));
            return res.status(404).json({ message: "Room not found" });
        }

        //check duplicate room number 
        if (updatedData.roomNumber!==undefined && updatedData.roomNumber !== room.roomNumber) {
            const exist = await Rooms.findOne({ where: { roomNumber: updatedData.roomNumber, propertyId: room.propertyId, id: { [Op.ne]: room.id } } });
            if (exist) {
                await logApiCall(req, res, 400, `Updated room - room number already exists (ID: ${id})`, "room", parseInt(id));
                return res.status(400).json({ message: "Room number already exists for this property" });
            }
        }

        // Update status if availableForBooking is passed
        if (updatedData.status !== undefined ) {
            updatedData.status = updatedData.status === "available" ? "available" : "unavailable";
        }

        //recalculate deposit if rent changes
        if (updatedData.monthlyRent !== null && updatedData.monthlyRent !== undefined) {
            updatedData.depositAmount = updatedData.monthlyRent * 2;
        }

        //apply update dynamically
        await room.update(
            updatedData  // keep other updates
        );

        await logApiCall(req, res, 200, `Updated room: ${room.roomNumber} (ID: ${id})`, "room", parseInt(id));
        return res.status(200).json({ message: "Room updated successfully", room });

    } catch (err) {
        console.log("error", err);
        await logApiCall(req, res, 500, "Error occurred while updating room", "room", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// delete Rooms
exports.DeleteRooms = async (req, res) => {
    try {

        const { id } = req.params;

        const room = await Rooms.findByPk(id);
        if (!room) {
            await logApiCall(req, res, 404, `Deleted room - room not found (ID: ${id})`, "room", parseInt(id));
            return res.status(404).json({ message: "Room not found" });
        }

        const today = new Date();

        const hasActiveOrFutureBookings = await Booking.findOne({
            where: {
                roomId: id,
                status: { [Op.in]: ["approved", "pending"] },
                checkOutDate: { [Op.gte]: today }
            }
        });

        if (hasActiveOrFutureBookings) {
            await logApiCall(req, res, 400, `Deleted room - has active bookings (ID: ${id})`, "room", parseInt(id));
            return res.status(400).json({ message: "Room cannot be deleted, it has active or future bookings" });
        }


        // Delete all images from folder
        if (room.images && room.images.length > 0) {
            for (const imgUrl of room.images) {
                const filePath = path.join(__dirname, "..", imgUrl.replace(/^\//, ""));
                if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
            }
        }


        await room.destroy();
        await logApiCall(req, res, 200, `Deleted room: ${room.roomNumber} (ID: ${id})`, "room", parseInt(id));
        res.status(200).json({ message: "Room deleted successfully" });

    } catch (err) {
        console.log("error", err);
        await logApiCall(req, res, 500, "Error occurred while deleting room", "room", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: "Internal server error" });
    }
}

//get Rooms
exports.getAllRooms = async (req, res) => {
    try {
        const role= req.query.role || 'user';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { rows: rooms, count } = await Rooms.findAndCountAll(
            {
                include: [
                    {
                        model: Booking,
                        as: 'bookings',
                        where: { status: { [Op.notIn]: ['rejected', 'cancelled'] } },
                        required: false
                    },
                    {
                        model: Property,
                        as: 'property',
                    }
                ],
                limit,
                offset,order:[['createdAt', 'DESC']]
            }
        )

        const formattedRooms = rooms.map((room) => {
            const capacity = room.capacity;
            const occupied = room.bookings ? room.bookings.length : 0;

            let status;

            if (room.status === "unavailable") {
                status = "unavailable"; // admin blocked
            } else {
                // admin allowed
                if (occupied >= capacity) {
                    status = "sold"; // fully occupied
                } else {
                    status = "available"; // still space left
                }
            }

            return {
                id: room.id,
                propertyId: room.propertyId,
                roomNumber: room.roomNumber,
                roomType: room.roomType,
                capacity,
                floorNumber: room.floorNumber,
                monthlyRent: room.monthlyRent,
                depositAmount: room.depositAmount,
                preferredUserType: room.preferredUserType,
                amenities: room.amenities || [],
                description: room.description,
                images: room.images || [],
                status,
                occupancy: `${occupied}/${capacity}`,
                property: room.property ? {
                    id: room.property.id,
                    name: room.property.name,
                    address: room.property.address,
                    amenities: room.property.amenities,
                    images: room.property.images,
                } : null
            };
        });

        const totalPages=Math.ceil(count / limit);

        await logApiCall(req, res, 200, "Viewed all rooms list", "room");
        res.status(200).json({ rooms: formattedRooms,currentPage: page, totalPages, totalRooms: count });
    } catch (err) {
        console.log("error", err);
        await logApiCall(req, res, 500, "Error occurred while fetching rooms list", "room");
        return res.status(500).json({ message: "Internal server error" });
    }

}

exports.getRoomsByProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const rooms = await Rooms.findAll({
      where: { propertyId },
      attributes: ["id", "roomNumber", "roomType", "status"],
    });

    if (!rooms || rooms.length === 0) {
      await logApiCall(req, res, 404, `Viewed rooms by property - no rooms found (Property ID: ${propertyId})`, "room");
      return res
        .status(404)
        .json({ message: "No rooms found for this property" });
    }

    await logApiCall(req, res, 200, `Viewed rooms by property (Property ID: ${propertyId})`, "room");
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Error fetching rooms by property:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching rooms by property", "room");
    res.status(500).json({ message: "Server error fetching rooms" });
  }
};

exports.getAvailableRooms = async (req, res) => {
  try {
    const { propertyId, roomType } = req.params;

    const rooms = await Rooms.findAll({
      where: { propertyId, roomType },
      include: [
        {
          model: Booking,
          as: "bookings",
          where: {
            status: { [Op.in]: ["pending", "approved", "active"] }
          },
          required: false
        }
      ]
    });

    const availableRooms = rooms.filter(
      room => (room.bookings?.length || 0) < room.capacity
    );

    await logApiCall(req, res, 200, `Viewed available rooms (Property ID: ${propertyId}, Room Type: ${roomType})`, "room");
    res.json({ rooms: availableRooms });
  } catch (err) {
    console.error("Error fetching available rooms:", err);
    await logApiCall(req, res, 500, "Error occurred while fetching available rooms", "room");
    res.status(500).json({ message: "Failed to load available rooms" });
  }
};

exports.getInventoryForProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const items = await Inventory.findAll({
      where: { propertyId },
      order: [["itemName", "ASC"]],
    });

    await logApiCall(req, res, 200, `Viewed inventory for property (Property ID: ${propertyId})`, "room");
    return res.json({ items });
  } catch (err) {
    console.error("getInventoryForProperty:", err);
    await logApiCall(req, res, 500, "Error occurred while fetching inventory for property", "room");
    return res.status(500).json({ message: "Failed to fetch inventory" });
  }
};

exports.assignInventoryManual = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { roomId } = req.params;
    const { itemIds } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      await t.rollback();
      await logApiCall(req, res, 400, "Failed to assign inventory manually - no itemIds provided", "room", parseInt(roomId));
      return res.status(400).json({ message: "No itemIds provided" });
    }

    const room = await Rooms.findByPk(roomId, { transaction: t });
    if (!room) {
      await t.rollback();
      await logApiCall(req, res, 404, `Failed to assign inventory manually - room not found (ID: ${roomId})`, "room", parseInt(roomId));
      return res.status(404).json({ message: "Room not found" });
    }

    const items = await Inventory.findAll({
      where: { id: itemIds },
      transaction: t,
    });

    // Validate property match
    for (const item of items) {
      if (item.propertyId !== room.propertyId) {
        await t.rollback();
        await logApiCall(req, res, 400, `Failed to assign inventory manually - item belongs to different property (Room ID: ${roomId})`, "room", parseInt(roomId));
        return res.status(400).json({
          message: `Item ${item.id} belongs to a different property`,
        });
      }
    }

    await Inventory.update(
      { roomId },
      { where: { id: { [Op.in]: itemIds } } }
    );


    await t.commit();
    await logApiCall(req, res, 200, `Assigned ${itemIds.length} inventory items manually to room (ID: ${roomId})`, "room", parseInt(roomId));
    return res.json({
      message: "Inventory assigned manually",
      assigned: itemIds.length,
    });
  } catch (err) {
    await t.rollback();
    console.error("assignInventoryManual:", err);
    await logApiCall(req, res, 500, "Error occurred while assigning inventory manually", "room", parseInt(req.params.roomId) || 0);
    return res.status(500).json({ message: "Failed manual assignment" });
  }
};

// AUTO ASSIGN INVENTORY TO ROOM (BATCH SAFE)
exports.assignInventoryAuto = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { items } = req.body; 
    // items = [{ itemName: "Bed", quantity: 3 }, ...]

    if (!roomId) {
      await logApiCall(req, res, 400, "Failed to auto-assign inventory - roomId required", "room");
      return res.status(400).json({ message: "roomId is required" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await logApiCall(req, res, 400, "Failed to auto-assign inventory - no items provided", "room", parseInt(roomId));
      return res.status(400).json({ message: "No inventory items provided" });
    }

    // Find room and property
    const room = await Rooms.findByPk(roomId);
    if (!room) {
      await logApiCall(req, res, 404, `Failed to auto-assign inventory - room not found (ID: ${roomId})`, "room", parseInt(roomId));
      return res.status(404).json({ message: "Room not found" });
    }

    const propertyId = room.propertyId;

    let lastInventory = await Inventory.findOne({
      where: { propertyId },
      order: [["createdAt", "DESC"]],
      attributes: ["inventoryCode"],
    });

    // Extract last sequence
    let lastSeq = 0;
    if (lastInventory?.inventoryCode) {
      const match = lastInventory.inventoryCode.match(/INV-PR\d+-(\d+)/);
      if (match) lastSeq = parseInt(match[1]);
    }

    const createdItems = [];

    // Process each item type (e.g., Bed × 3)
    for (const entry of items) {
      const { itemName, quantity } = entry;
      if (!itemName || !quantity)
        continue;

      for (let i = 1; i <= quantity; i++) {
        const nextSeq = String(lastSeq + 1).padStart(3, "0");
        lastSeq++; // increment local counter

        const inventoryCode = `INV-PR${propertyId}-${nextSeq}`;

        const newItem = await Inventory.create({
          inventoryCode,
          itemName,
          category: itemName,       // using item name as category (as per your system)
          propertyId,
          roomId,
          isCommonAsset: false,
        });

        createdItems.push(newItem);
      }
    }

    await logApiCall(req, res, 201, `Auto-assigned ${createdItems.length} inventory items to room (ID: ${roomId})`, "room", parseInt(roomId));
    return res.status(201).json({
      success: true,
      message: "Inventory auto-assigned successfully",
      items: createdItems,
    });

  } catch (error) {
    console.error("assignInventoryAuto Error:", error);
    await logApiCall(req, res, 500, "Error occurred while auto-assigning inventory", "room", parseInt(req.params.roomId) || 0);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
