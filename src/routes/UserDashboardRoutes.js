const express = require("express");
const router = express.Router();
const UserDashboardController = require("../controllers/UserDashboardController");
const authenticateToken = require("../middleware/auth");

router.get(
  "/dashboard",
  authenticateToken,
  UserDashboardController.getUserDashboard
);

module.exports = router;
