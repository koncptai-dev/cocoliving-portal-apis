const Inventory = require("../models/inventory");

/**
 * Generate a new inventory code for a given property.
 * Format: INV-PR<propertyId>-<sequence>
 * Example: INV-PR2-007
 */
exports.generateInventoryCode = async (propertyId, transaction = null) => {
  try {

    const lastInventory = await Inventory.findOne({
      where: { propertyId },
      order: [["id", "DESC"]],
      attributes: ["inventoryCode"],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });

    let lastSeq = 0;

    if (lastInventory && lastInventory.inventoryCode) {
      const match = lastInventory.inventoryCode.match(/INV-PR\d+-(\d+)/);
      if (match && match[1]) {
        lastSeq = parseInt(match[1]);
      }
    }

    const nextSeq = String(lastSeq + 1).padStart(3, "0");

    return `INV-PR${propertyId}-${nextSeq}`;

  } catch (error) {
    console.error("Error generating inventory code:", error);
    throw error;
  }
};