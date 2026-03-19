const csvParser = require("csv-parser");
const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const PropertyRateCard = require('../models/propertyRateCard');
const Inventory = require('../models/inventory');
const { generateInventoryCode } = require('../helpers/InventoryCode');
const { logApiCall } = require("../helpers/auditLog");
const fs = require('fs');
const path = require('path');

const { Op } = require('sequelize');


//Add Rooms  for admin
exports.AddRooms = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, preferredUserType, description, status } = req.body;

    //check property exist or not
    const property = await Property.findByPk(propertyId);
    if (!property) {
      await t.rollback();
      await logApiCall(req, res, 404, `Added room - property not found (ID: ${propertyId})`, "room");
      return res.status(404).json({ message: "Property not found" });
    }

    //check rooms are exist -> unique room number
    const existingRoom = await Rooms.findOne({ where: { roomNumber, propertyId },
    transaction: t });
    if (existingRoom) {
      await t.rollback()
      await logApiCall(req, res, 400, `Added room - room already exists (${roomNumber})`, "room");
      return res.status(400).json({ message: "Room already exists for this property" });
    }

    const finalStatus = status === "available" ? "available" : "unavailable";

    const newRoom = await Rooms.create({
      propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount: monthlyRent * 2, preferredUserType, description, status: finalStatus
    },{transaction: t});

    const defaultSetItems = [
      "Bed",
      "Wardrobe",
      "Study Table",
      "Chair"
    ];

    for (let setNumber = 1; setNumber <= capacity; setNumber++) {

      for (const baseItem of defaultSetItems) {

        const inventoryCode = await generateInventoryCode(propertyId, t);

        let itemName = baseItem;

        if (baseItem === "Bed") {
          itemName = `Bed${setNumber}`;
        }

        await Inventory.create({
          inventoryCode,
          itemName,
          category: baseItem,   // keep category generic
          propertyId,
          roomId: newRoom.id,
          setNumber,
          isCommonAsset: false
        }, { transaction: t });

      }

    }

    await t.commit();

    await logApiCall(req, res, 201, `Added new room: ${roomNumber} (ID: ${newRoom.id})`, "room", newRoom.id);
    return res.status(201).json({ message: 'Rooms added successfully', room: newRoom })

  } catch (err) {
    await t.rollback();
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
    if (updatedData.roomNumber !== undefined && updatedData.roomNumber !== room.roomNumber) {
      const exist = await Rooms.findOne({ where: { roomNumber: updatedData.roomNumber, propertyId: room.propertyId, id: { [Op.ne]: room.id } } });
      if (exist) {
        await logApiCall(req, res, 400, `Updated room - room number already exists (ID: ${id})`, "room", parseInt(id));
        return res.status(400).json({ message: "Room number already exists for this property" });
      }
    }

    // Update status if availableForBooking is passed
    if (updatedData.status !== undefined) {
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

    const role = req.query.role || 'user';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { propertyId } = req.query;

    let whereCondition = {};

    if (propertyId) {
      whereCondition.propertyId = propertyId;  
    }
    const { rows: rooms, count } = await Rooms.findAndCountAll(
      {
        where:whereCondition,
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
        offset, order: [['createdAt', 'DESC']]
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

    const totalPages = Math.ceil(count / limit);

    await logApiCall(req, res, 200, "Viewed all rooms list", "room");
    res.status(200).json({ rooms: formattedRooms, currentPage: page, totalPages, totalRooms: count });
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

// exports.assignInventoryManual = async (req, res) => {
//   const t = await sequelize.transaction();
//   try {
//     const { roomId } = req.params;
//     const { itemIds } = req.body;

//     if (!Array.isArray(itemIds) || itemIds.length === 0) {
//       await t.rollback();
//       await logApiCall(req, res, 400, "Failed to assign inventory manually - no itemIds provided", "room", parseInt(roomId));
//       return res.status(400).json({ message: "No itemIds provided" });
//     }

//     const room = await Rooms.findByPk(roomId, { transaction: t });
//     if (!room) {
//       await t.rollback();
//       await logApiCall(req, res, 404, `Failed to assign inventory manually - room not found (ID: ${roomId})`, "room", parseInt(roomId));
//       return res.status(404).json({ message: "Room not found" });
//     }

//     const items = await Inventory.findAll({
//       where: { id: itemIds },
//       transaction: t,
//     });

//     // Validate property match
//     for (const item of items) {
//       if (item.propertyId !== room.propertyId) {
//         await t.rollback();
//         await logApiCall(req, res, 400, `Failed to assign inventory manually - item belongs to different property (Room ID: ${roomId})`, "room", parseInt(roomId));
//         return res.status(400).json({
//           message: `Item ${item.id} belongs to a different property`,
//         });
//       }
//     }

//     await Inventory.update(
//       { roomId },
//       { where: { id: { [Op.in]: itemIds } } }
//     );


//     await t.commit();
//     await logApiCall(req, res, 200, `Assigned ${itemIds.length} inventory items manually to room (ID: ${roomId})`, "room", parseInt(roomId));
//     return res.json({
//       message: "Inventory assigned manually",
//       assigned: itemIds.length,
//     });
//   } catch (err) {
//     await t.rollback();
//     console.error("assignInventoryManual:", err);
//     await logApiCall(req, res, 500, "Error occurred while assigning inventory manually", "room", parseInt(req.params.roomId) || 0);
//     return res.status(500).json({ message: "Failed manual assignment" });
//   }
// };

// // AUTO ASSIGN INVENTORY TO ROOM (BATCH SAFE)
// exports.assignInventoryAuto = async (req, res) => {
//   try {
//     const { roomId } = req.params;
//     const { items } = req.body;
//     // items = [{ itemName: "Bed", quantity: 3 }, ...]

//     if (!roomId) {
//       await logApiCall(req, res, 400, "Failed to auto-assign inventory - roomId required", "room");
//       return res.status(400).json({ message: "roomId is required" });
//     }

//     if (!items || !Array.isArray(items) || items.length === 0) {
//       await logApiCall(req, res, 400, "Failed to auto-assign inventory - no items provided", "room", parseInt(roomId));
//       return res.status(400).json({ message: "No inventory items provided" });
//     }

//     // Find room and property
//     const room = await Rooms.findByPk(roomId);
//     if (!room) {
//       await logApiCall(req, res, 404, `Failed to auto-assign inventory - room not found (ID: ${roomId})`, "room", parseInt(roomId));
//       return res.status(404).json({ message: "Room not found" });
//     }

//     const propertyId = room.propertyId;

//     let lastInventory = await Inventory.findOne({
//       where: { propertyId },
//       order: [["createdAt", "DESC"]],
//       attributes: ["inventoryCode"],
//     });

//     // Extract last sequence
//     let lastSeq = 0;
//     if (lastInventory?.inventoryCode) {
//       const match = lastInventory.inventoryCode.match(/INV-PR\d+-(\d+)/);
//       if (match) lastSeq = parseInt(match[1]);
//     }

//     const createdItems = [];

//     // Process each item type (e.g., Bed × 3)
//     for (const entry of items) {
//       const { itemName, quantity } = entry;
//       if (!itemName || !quantity)
//         continue;

//       for (let i = 1; i <= quantity; i++) {
//         const nextSeq = String(lastSeq + 1).padStart(3, "0");
//         lastSeq++; // increment local counter

//         const inventoryCode = `INV-PR${propertyId}-${nextSeq}`;

//         const newItem = await Inventory.create({
//           inventoryCode,
//           itemName,
//           category: itemName,       // using item name as category (as per your system)
//           propertyId,
//           roomId,
//           isCommonAsset: false,
//         });

//         createdItems.push(newItem);
//       }
//     }

//     await logApiCall(req, res, 201, `Auto-assigned ${createdItems.length} inventory items to room (ID: ${roomId})`, "room", parseInt(roomId));
//     return res.status(201).json({
//       success: true,
//       message: "Inventory auto-assigned successfully",
//       items: createdItems,
//     });

//   } catch (error) {
//     console.error("assignInventoryAuto Error:", error);
//     await logApiCall(req, res, 500, "Error occurred while auto-assigning inventory", "room", parseInt(req.params.roomId) || 0);
//     return res.status(500).json({ message: "Internal server error", error });
//   }
// };

exports.importRooms = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const filePath = path.resolve(req.file.path);
    const rows = [];
    const skippedRows = [];
    let inserted = 0;

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream.on("data", (row) => rows.push(row));

    stream.on("end", async () => {
      try {
        const lastInventory = await Inventory.findOne({
          where: { propertyId: req.body.propertyId },
          order: [["createdAt", "DESC"]],
          attributes: ["inventoryCode"]
        });

        let inventorySeq = 0;

        if (lastInventory && lastInventory.inventoryCode) {
          const match = lastInventory.inventoryCode.match(/INV-PR\d+-(\d+)/);
          if (match) inventorySeq = parseInt(match[1]);
        }
        
        const roomTypeConfig = {
          "Single sharing": { roomType: "Single Sharing", capacity: 1 },
          "Double sharing": { roomType: "Double Sharing", capacity: 2 },
          "Triple sharing": { roomType: "Triple Sharing", capacity: 3 },
          "Quad sharing": { roomType: "Quad Sharing", capacity: 4 },
          "Premium triple sharing": { roomType: "Premium Triple Sharing", capacity: 3 },
        };

        for (const [index, row] of rows.entries()) {

          const floorNumber = row["Floor Number"];

          if (!floorNumber) {
            skippedRows.push({
              row,
              reason: "Missing Floor Number",
              line: index + 2
            });
            continue;
          }

          for (const column of Object.keys(roomTypeConfig)) {

            const value = row[column];

            if (!value) continue;

            const roomNumbers = value
              .split(",")
              .map(r => r.trim())
              .filter(Boolean);

            for (const roomNumber of roomNumbers) {

              try {

                const exists = await Rooms.findOne({
                  where: {
                    propertyId: req.body.propertyId,
                    roomNumber
                  }
                });

                if (exists) {
                  skippedRows.push({
                    row: { roomNumber },
                    reason: `Room ${roomNumber} already exists`,
                    line: index + 2
                  });
                  continue;
                }

                const { roomType, capacity } = roomTypeConfig[column];
                const rateCard = await PropertyRateCard.findOne({
                  where: {
                    propertyId: req.body.propertyId,
                    roomType
                  }
                });

                if (!rateCard) {
                  skippedRows.push({
                    row: { roomNumber },
                    reason: `Rate card not found for room type ${roomType}`,
                    line: index + 2
                  });
                  continue;
                }
                const newRoom = await Rooms.create({
                  propertyId: req.body.propertyId,
                  roomNumber,
                  roomType,
                  capacity,
                  floorNumber,
                  monthlyRent: rateCard.rent,
                  depositAmount: rateCard.rent * 2,
                  status: "available"
                });

                const defaultItems = [
                  "Bed",
                  "Wardrobe",
                  "Study Table",
                  "Chair"
                ];

                for (let setNumber = 1; setNumber <= capacity; setNumber++) {

                  for (const baseItem of defaultItems) {

                    inventorySeq++;
                    const code = `INV-PR${req.body.propertyId}-${String(inventorySeq).padStart(3, "0")}`;

                    let itemName = baseItem;
                    if (baseItem === "Bed") {
                      itemName = `Bed${setNumber}`;
                    }

                    await Inventory.create({
                      inventoryCode: code,
                      itemName,
                      category: baseItem,
                      propertyId: req.body.propertyId,
                      roomId: newRoom.id,
                      setNumber,
                      isCommonAsset: false
                    });
                  }
                }

                inserted++;

              } catch (innerError) {

                skippedRows.push({
                  row: { roomNumber },
                  reason: innerError.message,
                  line: index + 2
                });

              }

            }
          }
        }

        fs.unlinkSync(filePath);

        return res.json({
          message: "CSV Import Summary",
          totalRows: rows.length,
          inserted,
          skipped: skippedRows.length,
          skippedRows
        });

      } catch (error) {

        console.error("Error processing CSV:", error);
        res.status(500).json({
          message: "Error processing CSV",
          error: error.message
        });

      }
    });

  } catch (error) {

    console.error("Error importing CSV:", error);
    res.status(500).json({
      message: "Internal Server Error"
    });

  }
};
const User = require('../models/user');

exports.getRoomOccupants = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Rooms.findByPk(roomId);
    if (!room) {
      await logApiCall(req, res, 404, `Viewed room occupants - room not found (ID: ${roomId})`, "room", parseInt(roomId));
      return res.status(404).json({ message: "Room not found" });
    }

    const today = new Date();
    // Fetch bookings that are active or approved for this room
    const bookings = await Booking.findAll({
      where: {
        roomId,
        status: { [Op.in]: ['approved', 'active'] }, // typical active statuses
        // checkOutDate: { [Op.gte]: today } // currently staying
      },
      include: [
        {
          model: User,
          as: 'user', // Need to verify if association 'user' is correct
          attributes: ['fullName', 'email', 'phone', 'userType']
        }
      ]
    });

    // Formatting response to match requirement: Name, Email, Phone, Type, Check in & check out time
    const occupants = bookings.map(b => ({
      id: b.id,
      name: b.user ? b.user.fullName : 'Unknown',
      email: b.user ? b.user.email : 'N/A',
      phone: b.user ? b.user.phone : 'N/A',
      type: b.user ? b.user.userType : 'N/A',
      checkIn: b.checkInDate,
      checkOut: b.checkOutDate,
      status: b.status
    }));

    await logApiCall(req, res, 200, `Viewed occupants for room: ${room.roomNumber} (ID: ${roomId})`, "room", parseInt(roomId));
    res.status(200).json(occupants);

  } catch (err) {
    console.error("Error fetching room occupants:", err);
    await logApiCall(req, res, 500, "Error occurred while fetching room occupants", "room", parseInt(req.params.roomId) || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.downloadRoomCsvTemplate = async (req, res) => {
  try {

    const template =
    `Floor Number,Single sharing,Double sharing,Triple sharing,Quad sharing,Premium triple sharing
1,"100","101,115","102,103,104,105,106,110,111,112,113,114","107,108,109"
2,"200","201,215","202,203,204,205,206,210,211,212,213,214","207,208,209"
3,"300","301,315","302,303,304,305,306,310,311,312,313,314",,"307,308,309"
4,"400","401,415","402,403,404,405,406,410,411,412,413,414",,"407,408,409"
5,"500","501,515","502,503,504,505,506,510,511,512,513,514",,"507,508,509"`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=room_import_template.csv");

    res.send(template);

  } catch (error) {
    console.error("Template download error:", error);
    res.status(500).json({ message: "Failed to download template" });
  }
};