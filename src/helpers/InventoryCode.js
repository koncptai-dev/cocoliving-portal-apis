const Inventory = require("../models/inventory");
const sequelize = require("../config/database");

/**
 * 🔹 Generate a new inventory code for a given property.
 * Format: INV-PR<propertyId>-<sequence>
 * Example: INV-PR2-007
 */
exports.generateInventoryCode = async (propertyId) => {
  try {
    return await sequelize.transaction(async (t) => {
      // Lock rows belonging to the same property to avoid race conditions
      const lastInventory = await Inventory.findOne({
        where: { propertyId },
        order: [["createdAt", "DESC"]],
        attributes: ["inventoryCode"],
        transaction: t,
        lock: t.LOCK.UPDATE, // ✅ Prevent concurrent code generation
      });

      // Determine the last used sequence number
      let lastSeq = 0;
      if (lastInventory && lastInventory.inventoryCode) {
        const match = lastInventory.inventoryCode.match(/INV-PR\d+-(\d+)/);
        if (match && match[1]) {
          lastSeq = parseInt(match[1]);
        }
      }

      // Increment and format new code
      const nextSeq = String(lastSeq + 1).padStart(3, "0");
      const newCode = `INV-PR${propertyId}-${nextSeq}`;

      return newCode;
    });
  } catch (error) {
    console.error("Error generating inventory code:", error);
    throw error;
  }
};
