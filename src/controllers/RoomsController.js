const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const { Inventory } = require("../models");
const { generateInventoryCode } = require("../helpers/inventoryCode");

const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

//Add Rooms  for admin
exports.AddRooms = async (req, res) => {
    try {
        const { propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount, preferredUserType, amenities, description, availableForBooking } = req.body;

        //check property exist or not
        const property = await Property.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ message: "Property not found" });
        }

        //check rooms are exist -> unique room number
        const existingRoom = await Rooms.findOne({ where: { roomNumber, propertyId } });
        if (existingRoom) {
            return res.status(400).json({ message: "Room already exists for this property" });
        }

        const status = availableForBooking ? "available" : "not-available";
        const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || [];

        //handle images
        const imageUrls = req.files ? req.files.map(file => `/uploads/roomImages/${file.filename}`) : [];

        // Check limit
        if (imageUrls.length > 20) {
            return res.status(400).json({ message: "You can upload a maximum of 20 images per room" });
        }

        //calculate deposite amount 
        const calculatedDeposit = monthlyRent * 2;

        const newRooms = await Rooms.create({
            propertyId, roomNumber, roomType, capacity, floorNumber, images: imageUrls, monthlyRent, depositAmount: calculatedDeposit, preferredUserType,
            amenities: amenitiesArray, description, status
        })

        res.status(201).json({ message: 'Rooms added successfully', room: newRooms })

    } catch (err) {
        console.log("error->", err
        );

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
            return res.status(404).json({ message: "Room not found" });
        }

        //check duplicate room number 
        if (updatedData.roomNumber && updatedData.roomNumber !== room.roomNumber) {
            const exist = await Rooms.findOne({ where: { roomNumber: updatedData.roomNumber, propertyId: room.propertyId, id: { [Op.ne]: room.id } } });
            if (exist) {
                return res.status(400).json({ message: "Room number already exists for this property" });
            }
        }

        // Update status if availableForBooking is passed
        if (updatedData.availableForBooking !== undefined) {
            updatedData.status = updatedData.availableForBooking ? "available" : "not-available";
        }

        //aminities array handling
        if (updatedData.amenities !== undefined && updatedData.amenities !== null) {
            updatedData.amenities = Array.isArray(updatedData.amenities)
                ? updatedData.amenities
                : updatedData.amenities.split(',').map(a => a.trim()).filter(a => a);
        }

        // already stored images
        let updatedImages = room.images || [];

        // removedImages passed from frontend
        let removedImages = updatedData.removedImages || [];
        if (typeof removedImages === "string") removedImages = [removedImages]; // single string -> array

        // Remove selected images from array
        updatedImages = updatedImages.filter(img => !removedImages.includes(img));

        // Delete files from folder
        for (const imgUrl of removedImages) {
            const filePath = path.join(__dirname, "..", imgUrl.replace(/^\//, ""));
            if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
        }

        // Add new uploaded images
        if (req.files && req.files.length > 0) {
            const newImageUrls = req.files.map(f => `/uploads/roomImages/${f.filename}`);
            if (updatedImages.length + newImageUrls.length > 20) {
                return res.status(400).json({
                    message: `Cannot upload images. Room already has ${updatedImages.length} images. Maximum allowed is 20.`
                });
            }
            updatedImages = [...updatedImages, ...newImageUrls];
        }

        // Save final array
        updatedData.images = updatedImages;

        //recalculate deposit if rent changes
        if (updatedData.monthlyRent !== null && updatedData.monthlyRent !== undefined) {
            updatedData.depositAmount = updatedData.monthlyRent * 2;
        }

        //apply update dynamically
        await room.update({
            ...updatedData,  // keep other updates
            images: updatedImages  //  images field to update
        });

        res.status(200).json({ message: "Room updated successfully", room });

    } catch (err) {
        console.log("error", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// delete Rooms
exports.DeleteRooms = async (req, res) => {
    try {

        const { id } = req.params;

        const room = await Rooms.findByPk(id);
        if (!room) {
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
        res.status(200).json({ message: "Room deleted successfully" });

    } catch (err) {
        console.log("error", err);

        return res.status(500).json({ message: "Internal server error" });
    }
}

//get Rooms
exports.getAllRooms = async (req, res) => {
    try {
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

            if (room.status === "not-available") {
                status = "not-available"; // admin blocked
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

        res.status(200).json({ rooms: formattedRooms,currentPage: page, totalPages, totalRooms: count });
    } catch (err) {
        console.log("error", err);

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
      return res
        .status(404)
        .json({ message: "No rooms found for this property" });
    }

    res.status(200).json(rooms);
  } catch (error) {
    console.error("Error fetching rooms by property:", error);
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

    res.json({ rooms: availableRooms });
  } catch (err) {
    console.error("Error fetching available rooms:", err);
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

    return res.json({ items });
  } catch (err) {
    console.error("getInventoryForProperty:", err);
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
      return res.status(400).json({ message: "No itemIds provided" });
    }

    const room = await Rooms.findByPk(roomId, { transaction: t });
    if (!room) {
      await t.rollback();
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
    return res.json({
      message: "Inventory assigned manually",
      assigned: itemIds.length,
    });
  } catch (err) {
    await t.rollback();
    console.error("assignInventoryManual:", err);
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
      return res.status(400).json({ message: "roomId is required" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No inventory items provided" });
    }

    // Find room and property
    const room = await Rooms.findByPk(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

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

    return res.status(201).json({
      success: true,
      message: "Inventory auto-assigned successfully",
      items: createdItems,
    });

  } catch (error) {
    console.error("assignInventoryAuto Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
