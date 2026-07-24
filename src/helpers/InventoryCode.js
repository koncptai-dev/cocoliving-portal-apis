const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");

/**
 * Generate a new inventory code for a given property.
 * Format: INV-PR<propertyId>-<sequence>
 * Example: INV-PR2-007
 */
exports.generateInventoryCode = async (propertyId, transaction = null) => {
  try {
    const [result] = await sequelize.query(
      `
        SELECT COALESCE(
          MAX(CAST(substring("inventoryCode" FROM 'INV-PR\\d+-(\\d+)$') AS INTEGER)),
          0
        ) AS max_seq
        FROM inventories
        WHERE "propertyId" = :propertyId
      `,
      {
        replacements: { propertyId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const highestSeq = Number(result?.max_seq || 0);
    const nextSeq = String(highestSeq + 1).padStart(3, "0");

    return `INV-PR${propertyId}-${nextSeq}`;
  } catch (error) {
    console.error("Error generating inventory code:", error);
    throw error;
  }
};