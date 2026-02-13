const express = require("express");
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");
const DashboardController = require("../controllers/DashboardController");

// super-admin
router.get("/stats", authMiddleware, authorizeRole(1,3), DashboardController.getDashboardStats);
router.get("/report", authMiddleware, authorizeRole(1,3), DashboardController.getReport);

module.exports = router;
