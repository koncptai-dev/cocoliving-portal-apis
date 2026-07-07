const { generateInventoryCode } = require("../helpers/InventoryCode");
const Inventory = require('../models/inventory');
const Property = require('../models/property');
const Rooms = require('../models/rooms');
const { logApiCall } = require("../helpers/auditLog");
const {
    buildQrText,
    createPdfDocument,
    generateQrBuffer,
    addInventoryBlock,
    propertyFilename
} = require("../helpers/qrPdfHelper");
exports.addInventory = async (req, res) => {
  try {
    const { propertyId, roomId, itemName, category, isCommonAsset } = req.body;

    if (!propertyId || !itemName || !category) {
      await logApiCall(req, res, 400, "Failed to add inventory item - missing required fields", "inventory");
      return res
        .status(400)
        .json({ message: "Property, item name, and category are required." });
    }

    const inventoryCode = await generateInventoryCode(propertyId);

    const parsedIsCommonAsset =
      String(isCommonAsset).trim().toLowerCase() === "true" ||
      String(isCommonAsset).trim().toLowerCase() === "yes" ||
      String(isCommonAsset).trim().toLowerCase() === "on";

    const newInventory = await Inventory.create({
      ...req.body,
      inventoryCode,
      isCommonAsset: parsedIsCommonAsset,
      // enforce rule: if isCommonAsset → no roomId
      roomId: parsedIsCommonAsset ? null : roomId,
    });

    await logApiCall(req, res, 201, `Added new inventory item: ${itemName}`, "inventory", newInventory.id);
    res.status(201).json(newInventory);
  } catch (error) {
    console.error("Error in addInventory:", error);
    await logApiCall(req, res, 500, "Error occurred while adding inventory item", "inventory");
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// Get all inventory items
exports.getAllInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findAll({
      include: ["property", "room"],
      order: [["inventoryCode", "ASC"]],
    });
    await logApiCall(req, res, 200, "Viewed all inventory items", "inventory");
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching inventory list", "inventory");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get single inventory item
exports.getInventoryById = async (req, res) => {
  try {
    const inventory = await Inventory.findByPk(req.params.id, {
      include: [
        { model: Property, as: "property" },
        { model: Rooms, as: "room" },
      ],
    });
    if (!inventory) {
      await logApiCall(req, res, 404, `Viewed inventory item - item not found (ID: ${req.params.id})`, "inventory", parseInt(req.params.id));
      return res.status(404).json({ message: "Item not found" });
    }
    await logApiCall(req, res, 200, `Viewed inventory item: ${inventory.itemName}`, "inventory", inventory.id);
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching inventory item", "inventory");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get multiple inventory items by IDs
exports.getInventoryByIds = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await logApiCall(req, res, 400, "Failed to fetch inventory items - no IDs provided", "inventory");
      return res.status(400).json({ message: "No inventory IDs provided" });
    }

    const items = await Inventory.findAll({
      where: { id: ids },
      attributes: ["id", "itemName", "inventoryCode"],
    });

    await logApiCall(req, res, 200, `Fetched ${items.length} inventory items by IDs`, "inventory");
    res.json({ items });
  } catch (error) {
    console.error("Error fetching inventory by IDs:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching inventory items by IDs", "inventory");
    res.status(500).json({ message: "Failed to fetch inventory details" });
  }
};
// Update Inventory Item
exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const inventoryItem = await Inventory.findByPk(id);
    // Enforce isCommonAsset rule
    if (updates.isCommonAsset === true || updates.isCommonAsset === "true") {
      updates.roomId = null;
    }
    if (typeof updates.isCommonAsset === "string") {
      updates.isCommonAsset = ["true", "yes", "on"].includes(updates.isCommonAsset.toLowerCase());
    }

    if (!inventoryItem) {
      await logApiCall(req, res, 404, `Updated inventory item - item not found (ID: ${id})`, "inventory", parseInt(id));
      return res.status(404).json({ message: "Item not found" });
    }


    if (updates.propertyId && updates.propertyId !== inventoryItem.propertyId) {

      const newCode = await generateInventoryCode(updates.propertyId);
      updates.inventoryCode = newCode;
    }

    const [updatedCount] = await Inventory.update(updates, { where: { id } });

    if (!updatedCount) {
      await logApiCall(req, res, 400, `Updated inventory item - no changes detected (ID: ${id})`, "inventory", parseInt(id));
      return res
        .status(400)
        .json({ message: "Item not updated — no changes detected" });
    }

    const updatedItem = await Inventory.findByPk(id);

    await logApiCall(req, res, 200, `Updated inventory item: ${updatedItem.itemName}`, "inventory", parseInt(id));
    res.json({ message: "Inventory updated successfully", item: updatedItem });
  } catch (error) {
    await logApiCall(req, res, 500, "Error occurred while updating inventory item", "inventory");
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Delete inventory item
exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const inventoryItem = await Inventory.findByPk(id);
    if (!inventoryItem) {
      await logApiCall(
        req,
        res,
        404,
        `Deleted inventory item - item not found (ID: ${id})`,
        "inventory",
        parseInt(id)
      );
      return res.status(404).json({ message: "Item not found" });
    }
    if (inventoryItem.status === "Allocated") {
      await logApiCall(
        req,
        res,
        409,
        `Attempted delete on allocated inventory item (ID: ${id})`,
        "inventory",
        parseInt(id)
      );
      return res.status(409).json({
        message: "Allocated inventory items cannot be deleted",
      });
    }
    await Inventory.destroy({ where: { id } });
    await logApiCall(req, res, 200, `Deleted inventory item: ${inventoryItem?.itemName || "Unknown"}`, "inventory", parseInt(id));
    res.json({ message: "Inventory deleted successfully" });
  } catch (error) {
    console.error("Error deleting inventory:", error);
    await logApiCall(req, res, 500, "Error occurred while deleting inventory item", "inventory");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAvailableByRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const items = await Inventory.findAll({
      where: {
        roomId:roomId,     // match the room exactly
        status: 'Available'
      },
      order: [['id', 'ASC']]
    });
    await logApiCall(req, res, 200, `Viewed available inventory items for room (ID: ${roomId})`, "inventory", parseInt(roomId));
    return res.json({ items });
  } catch (err) {
    console.error('Get inventory by room error:', err);
    await logApiCall(req, res, 500, "Error occurred while fetching inventory by room", "inventory");
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.generateInventoryQr = async (req, res) => {
  try {
    const { inventoryId } = req.params;

    const inventory = await Inventory.findByPk(inventoryId, {
      include: [
        {
          model: Property,
          as: "property",
        },
        {
          model: Rooms,
          as: "room",
        },
      ],
    });

    if (!inventory) {
      return res.status(404).json({
        message: "Inventory not found",
      });
    }

    const qrBuffer = await generateQrBuffer(
      buildQrText(inventory)
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${inventory.inventoryCode}.png"`
    );
    await logApiCall(
      req,
      res,
      200,
      `Downloaded QR for inventory ${inventory.inventoryCode}`,
      "inventory",
      inventory.id
    );
    return res.send(qrBuffer);

  } catch (error) {
    console.error(error);

    await logApiCall(
      req,
      res,
      500,
      "Failed to generate inventory QR",
      "inventory"
    );

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.generateRoomQrPdf = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Rooms.findByPk(roomId, {
      include: [
        {
          model: Property,
          as: "property",
        },
      ],
    });

    if (!room) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const inventories = await Inventory.findAll({
      where: {
        roomId,
      },
      include: [
        {
          model: Property,
          as: "property",
        },
        {
          model: Rooms,
          as: "room",
        },
      ],
      order: [["inventoryCode", "ASC"]],
    });

    const doc = createPdfDocument(
      res,
      `Room-${room.roomNumber}.pdf`
    );

    doc.fontSize(22)
      .font("Helvetica-Bold")
      .text(`Room ${room.roomNumber}`, {
        align: "center",
      });

    doc.moveDown();

    doc.fontSize(15)
      .font("Helvetica")
      .text(room.property.name, {
        align: "center",
      });

    doc.moveDown(2);

    for (let i = 0; i < inventories.length; i++) {
      await addInventoryBlock(doc, inventories[i]);

      if (i !== inventories.length - 1) {
        if (doc.y > 620) {
          doc.addPage();
        }
      }
    }

    doc.end();

    await logApiCall(
      req,
      res,
      200,
      `Downloaded Room QR PDF (${room.roomNumber})`,
      "room",
      room.id
    );
  } catch (error) {
    console.error(error);

    await logApiCall(
      req,
      res,
      500,
      "Failed generating room QR PDF",
      "room"
    );

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

exports.generatePropertyQrPdf = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    const inventories = await Inventory.findAll({
      where: {
        propertyId,
      },
      include: [
        {
          model: Property,
          as: "property",
        },
        {
          model: Rooms,
          as: "room",
        },
      ],
      order: [
        [
          {
            model: Rooms,
            as: "room",
          },
          "roomNumber",
          "ASC",
        ],
        ["inventoryCode", "ASC"],
      ],
    });

    const doc = createPdfDocument(
      res,
      propertyFilename(property.name)
    );

    doc.fontSize(24)
      .font("Helvetica-Bold")
      .text(property.name, {
        align: "center",
      });

    doc.moveDown(2);

    let currentRoom = null;

    for (let i = 0; i < inventories.length; i++) {
      const inventory = inventories[i];

      if (currentRoom !== inventory.room?.roomNumber) {
        currentRoom = inventory.room?.roomNumber;

        doc.fontSize(18)
          .font("Helvetica-Bold")
          .text(
            `Room ${currentRoom || "Common Area"}`
          );

        doc.moveDown();
      }

      await addInventoryBlock(doc, inventory);

      if (i !== inventories.length - 1) {
        if (doc.y > 620) {
          doc.addPage();
        }
      }
    }

    doc.end();

    await logApiCall(
      req,
      res,
      200,
      `Downloaded Property QR PDF (${property.name})`,
      "property",
      property.id
    );
  } catch (error) {
    console.error(error);

    await logApiCall(
      req,
      res,
      500,
      "Failed generating property QR PDF",
      "property"
    );

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};