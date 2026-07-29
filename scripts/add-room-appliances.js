const { Op } = require("sequelize");
const sequelize = require("../src/config/database");
const Property = require("../src/models/property");
const Rooms = require("../src/models/rooms");
const Inventory = require("../src/models/inventory");
const { generateInventoryCode } = require("../src/helpers/InventoryCode");

const APPLIANCES = [
  {
    itemName: "Air Conditioner",
    category: "Electrical Appliances",
  },
  {
    itemName: "Geyser",
    category: "Electrical Appliances",
  },
];

const propertyId = Number.parseInt(process.argv[2], 10);

if (!Number.isSafeInteger(propertyId) || propertyId <= 0) {
  console.error("Usage: node scripts/add-room-appliances.js <propertyId>");
  process.exitCode = 1;
  return;
}

const main = async () => {
  await sequelize.authenticate();

  const property = await Property.findByPk(propertyId);
  if (!property) {
    throw new Error(`Property ${propertyId} was not found.`);
  }

  const summary = await sequelize.transaction(async (transaction) => {
    const rooms = await Rooms.findAll({
      where: { propertyId },
      attributes: ["id", "roomNumber"],
      order: [["roomNumber", "ASC"]],
      transaction,
    });

    if (!rooms.length) {
      return { roomCount: 0, roomResults: [] };
    }

    const existingItems = await Inventory.findAll({
      where: {
        propertyId,
        roomId: { [Op.in]: rooms.map((room) => room.id) },
        itemName: { [Op.in]: APPLIANCES.map((appliance) => appliance.itemName) },
      },
      attributes: ["id", "roomId", "itemName"],
      transaction,
    });

    const existingItemKeys = new Set();
    for (const item of existingItems) {
      const key = `${item.roomId}:${item.itemName}`;
      existingItemKeys.add(key);
    }

    const roomResults = [];
    for (const room of rooms) {
      const created = [];
      const skipped = [];

      for (const appliance of APPLIANCES) {
        const key = `${room.id}:${appliance.itemName}`;
        if (existingItemKeys.has(key)) {
          skipped.push(appliance.itemName);
          continue;
        }

        const inventoryCode = await generateInventoryCode(propertyId, transaction);
        await Inventory.create(
          {
            inventoryCode,
            itemName: appliance.itemName,
            category: appliance.category,
            propertyId,
            roomId: room.id,
            setNumber: null,
            isCommonAsset: false,
            description: null,
            unitCost: null,
            condition: "New",
            status: "Available",
            purchaseDate: new Date(),
          },
          { transaction }
        );
        created.push(`${appliance.itemName} (${inventoryCode})`);
      }

      roomResults.push({ roomNumber: room.roomNumber, created, skipped });
    }

    return { roomCount: rooms.length, roomResults };
  });

  console.log(`Property ${property.name} (${propertyId}): ${summary.roomCount} room(s) processed.`);
  const createdCount = summary.roomResults.reduce(
    (total, result) => total + result.created.length,
    0
  );
  console.log(`Success. Created ${createdCount} inventory item(s).`);

  for (const result of summary.roomResults) {
    const created = result.created.length ? result.created.join(", ") : "none";
    const skipped = result.skipped.length ? result.skipped.join(", ") : "none";
    console.log(`Room ${result.roomNumber} - created: ${created}; skipped (already present): ${skipped}.`);
  }
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
