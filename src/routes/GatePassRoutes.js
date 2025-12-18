const express = require("express");
const router = express.Router();
const GatePassController = require("../controllers/GatePassController");
const authenticateToken = require("../middleware/auth");
const {
  validateGatePass,
  validateGatePassUpdate,
  validateGatePassStatus,
} = require("../middleware/validation");
const validate = require("../middleware/validateResult");

// User routes
router.post(
  "/create",
  authenticateToken,
  validateGatePass,
  validate,
  GatePassController.createGatePass
);

router.put(
  "/update/:id",
  authenticateToken,
  validateGatePassUpdate,
  validate,
  GatePassController.updateGatePass
);

router.get(
  "/user-gate-passes",
  authenticateToken,
  GatePassController.getUserGatePasses
);

// Parent routes
router.get("/all", authenticateToken, GatePassController.getAllGatePasses);

router.put(
  "/approve-reject/:id",
  authenticateToken,
  validateGatePassStatus,
  validate,
  GatePassController.approveOrRejectGatePass
);

// Admin routes
router.get(
  "/admin/all",
  authenticateToken,
  GatePassController.getAdminGatePasses
);

module.exports = router;
