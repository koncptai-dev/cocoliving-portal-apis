const express = require("express");
const router = express.Router();
const controller = require("../controllers/serviceHistoryController");
const authenticateToken = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

// admin
// create service record for an inventory item
router.post("/:inventoryId", authenticateToken,authorizeRole(1,3), controller.createServiceRecord);

// get service history for an inventory
router.get(
  "/:inventoryId",
  authenticateToken,
  controller.getServiceHistoryForItem
);

// update an existing record
router.put("/record/:id", authenticateToken, controller.updateServiceRecord);

// delete a service record
router.delete(
  "/:inventoryId/record/:id",
  authenticateToken,
  controller.deleteServiceRecord
);


module.exports = router;