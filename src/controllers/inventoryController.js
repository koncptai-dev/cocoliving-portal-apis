const { generateInventoryCode } = require("../helpers/InventoryCode");
const { Inventory, Property, Rooms } = require('../models');
exports.addInventory = async (req, res) => {
  try {
    const { propertyId, roomId, itemName, category, isCommonAsset } = req.body;

    if (!propertyId || !itemName || !category) {
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




    console.log("Inventory created:", newInventory.toJSON());
    res.status(201).json(newInventory);
  } catch (error) {
    console.error("Error in addInventory:", error);
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
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
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
    if (!inventory) return res.status(404).json({ message: "Item not found" });
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get multiple inventory items by IDs
exports.getInventoryByIds = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No inventory IDs provided" });
    }

    const items = await Inventory.findAll({
      where: { id: ids },
      attributes: ["id", "itemName"],
    });

    res.json({ items });
  } catch (error) {
    console.error("Error fetching inventory by IDs:", error);
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
      return res.status(404).json({ message: "Item not found" });
    }


    if (updates.propertyId && updates.propertyId !== inventoryItem.propertyId) {

      const newCode = await generateInventoryCode(updates.propertyId);
      updates.inventoryCode = newCode;
      console.log(" New inventory code generated:", newCode);
    }

    const [updatedCount] = await Inventory.update(updates, { where: { id } });

    if (!updatedCount) {
      return res
        .status(400)
        .json({ message: "Item not updated — no changes detected" });
    }

    const updatedItem = await Inventory.findByPk(id);

    res.json({ message: "Inventory updated successfully", item: updatedItem });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

// Delete inventory item
exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Inventory.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Inventory deleted successfully" });
  } catch (error) {
    console.error("Error deleting inventory:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// exports.getAvailable = async (req, res) => {
//   try {
//     const { propertyId } = req.params;
//     console.log("Received propertyId:", propertyId); // <--- Debug line

//     const items = await Inventory.findAll({
//       where: { propertyId, status: "Available" },
//     });

//     console.log(`Found ${items.length} available items for propertyId ${propertyId}`); // <--- Debug line
//     res.json({ items });
//   } catch (error) {
//     console.error("Error fetching available inventory:", error);
//     res.status(500).json({ message: "Failed to fetch available inventory" });
//   }
// };
// get available inventory for a specific property + room
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
    return res.json({ items });
  } catch (err) {
    console.error('Get inventory by room error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
