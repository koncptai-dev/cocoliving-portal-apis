const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const json2csv = require("json2csv");
const { Inventory, Property, Rooms } = require("../models");
const generateInventoryCode = require("../helpers/InventoryCode");
const { logApiCall } = require("../helpers/auditLog");

// EXPORT INVENTORY TO CSV
exports.exportInventory = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const whereClause = propertyId ? { propertyId } : {}; 
    const inventories = await Inventory.findAll({
      where: whereClause,
      include: [
        {
          model: Property,
          as: "property",
          attributes: ["id", "name"],
        },
        {
          model: Rooms,
          as: "room",
          attributes: ["id", "roomNumber", "roomType"],
        },
      ],
      order: [["inventoryCode", "ASC"]],
    });

    if (!inventories.length) {
      await logApiCall(req, res, 404, "Exported inventory - no inventory data found", "inventory");
      return res.status(404).json({ message: "No inventory data found" });
    }

    const csvData = inventories.map((item) => ({
      inventoryCode: item.inventoryCode || "",
      itemName: item.itemName || "",
      category: item.category || "",
      description: item.description || "",
      property: item.property ? item.property.name : "",
      room: item.room
        ? `${item.room.roomNumber || ""} (${item.room.roomType || ""})`
        : "",
      isCommonAsset: item.isCommonAsset ? "Yes" : "No",
      unitCost: item.unitCost ?? "N/A",
      purchaseDate: item.purchaseDate
        ? new Date(item.purchaseDate).toISOString().split("T")[0]
        : "N/A",
      condition: item.condition || "",
      status: item.status || "",
    }));

    const csv = json2csv.parse(csvData);
    const exportDir = path.join(__dirname, "../uploads/csv");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = propertyId ? `inventory_export_property_${propertyId}_${Date.now()}.csv` : `inventory_export_${Date.now()}.csv`;

    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, csv);

    await logApiCall(req, res, 200, `Exported inventory to CSV (Property ID: ${propertyId || 'all'})`, "inventory");
    res.download(filePath, (err) => {
      if (err) console.error("Error sending file:", err);
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error("Error exporting inventory:", error);
    await logApiCall(req, res, 500, "Error occurred while exporting inventory", "inventory");
    res.status(500).json({
      message: "Error exporting inventory",
      error: error.message,
    });
  }
};

// IMPORT INVENTORY FROM CSV
exports.importInventory = async (req, res) => {
  try {
    if (!req.file) {
      await logApiCall(req, res, 400, "Imported inventory - no CSV file uploaded", "inventory");
      return res.status(400).json({ message: "No CSV file uploaded" });
    }

    const filePath = path.resolve(req.file.path);
    const importedRows = [];
    const skippedRows = [];
    let inserted = 0;

    const stream = fs.createReadStream(filePath).pipe(csvParser());

    stream.on("data", (row) => {
      importedRows.push(row);
    });

    stream.on("end", async () => {
      try {

        for (const [index, row] of importedRows.entries()) {
          const { itemName, category, propertyId } = row;

          if (!itemName || !category || !propertyId) {
            skippedRows.push({ row, reason: "Missing required fields", line: index + 2 });
            continue;
          }

          try {
            const propertyExists = await Property.findByPk(propertyId);
            if (!propertyExists) {
              skippedRows.push({ row, reason: `Property ID ${propertyId} does not exist`, line: index + 2 });
              continue;
            }

            if (row.roomId) {
              const roomExists = await Rooms.findByPk(row.roomId);
              if (!roomExists) {
                skippedRows.push({ row, reason: `Room ID ${row.roomId} not found`, line: index + 2 });
                continue;
              }
            }

            const newCode = await generateInventoryCode(propertyId);

            await Inventory.create({
              inventoryCode: newCode,
              itemName,
              category,
              description: row.description || "",
              propertyId,
              roomId: row.roomId || null,
              isCommonAsset: String(row.isCommonAsset).toLowerCase() === "true",
              unitCost: row.unitCost || null,
              purchaseDate: row.purchaseDate && !isNaN(Date.parse(row.purchaseDate))
                ? new Date(row.purchaseDate)
                : null,
              condition: row.condition || "New",
              status: row.status || "Available",
            });

            inserted++;
          } catch (innerError) {
            skippedRows.push({ row, reason: innerError.message, line: index + 2 });
          }
        }

        fs.unlinkSync(filePath);

        await logApiCall(req, res, 200, `Imported inventory from CSV (Inserted: ${inserted}, Skipped: ${skippedRows.length})`, "inventory");
        return res.json({
          message: "CSV Import Summary",
          totalRows: importedRows.length,
          inserted,
          skipped: skippedRows.length,
          skippedRows,
        });
      } catch (error) {
        console.error("Error processing CSV:", error);
        await logApiCall(req, res, 500, "Error occurred while processing CSV import", "inventory");
        res.status(500).json({ message: "Error processing CSV", error: error.message });
      }
    });
  } catch (error) {
    console.error("Error importing CSV:", error);
    await logApiCall(req, res, 500, "Error occurred while importing inventory CSV", "inventory");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.downloadTemplate = async (req, res) => {
  try {
    const template = [
      {
        itemName: "Chair",
        category: "Furniture",
        description: "Comfortable office chair",
        propertyId: "1", // required
        roomId: "", // optional, can be empty
        isCommonAsset: "false", // true/false
        unitCost: "1200",
        purchaseDate: "2025-01-01",
        condition: "Good",
        status: "Available", 
      },
    ];

    const csv = json2csv.parse(template);
    const exportDir = path.join(__dirname, "../uploads/csv");
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const filePath = path.join(exportDir, "inventory_template.csv");
    fs.writeFileSync(filePath, csv);

    await logApiCall(req, res, 200, "Downloaded inventory CSV template", "inventory");
    res.download(filePath, "inventory_template.csv", (err) => {
      if (err) console.error("Template download error:", err);
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error("Error creating template:", error);
    await logApiCall(req, res, 500, "Error occurred while downloading inventory template", "inventory");
    res.status(500).json({ message: "Error generating template", error: error.message });
  }
};