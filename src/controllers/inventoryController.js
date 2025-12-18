const { generateInventoryCode } = require("../helpers/InventoryCode");
const Inventory = require('../models/inventory');
const Property = require('../models/property');
const Rooms = require('../models/rooms');
const { logApiCall } = require("../helpers/auditLog");
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
      attributes: ["id", "itemName"],
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
    const deleted = await Inventory.destroy({ where: { id } });
    if (!deleted) {
      await logApiCall(req, res, 404, `Deleted inventory item - item not found (ID: ${id})`, "inventory", parseInt(id));
      return res.status(404).json({ message: "Item not found" });
    }
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
