const express = require("express");
const router = express.Router();
const controller = require("../controllers/inventoryController");
const csvController = require("../controllers/inventoryCsvController.js");
const authenticateToken = require("../middleware/auth");
const uploadCSV = require("../middleware/uploadCsv.js");
const authorizeRole = require("../middleware/authorizeRole");

//CSV Routes admin
router.get("/export/csv", authenticateToken,authorizeRole(1,3), csvController.exportInventory);// Export modes : export all inventory items & export inventory items of a specific property ( use ?propertyId= at end of request to filter by property )

// admin
router.post("/import/csv", authenticateToken, authorizeRole(1,3), uploadCSV.single("file"), csvController.importInventory);
router.get("/template", authenticateToken, authorizeRole(1,3), csvController.downloadTemplate);

//Normal Routes
router.post("/", authenticateToken, authorizeRole(1,3), controller.addInventory);
router.get("/", authenticateToken, authorizeRole(1,3), controller.getAllInventory);
router.get("/:id", authenticateToken, controller.getInventoryById);
router.post("/by-ids", controller.getInventoryByIds);
router.put("/:id", authenticateToken, controller.updateInventory);
router.delete("/:id", authenticateToken, controller.deleteInventory);
router.get('/available/:roomId', controller.getAvailableByRoom);

module.exports = router;