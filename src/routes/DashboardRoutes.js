const express = require("express");
const router = express.Router();
const DashboardController = require("../controllers/DashboardController");

router.get("/stats", DashboardController.getDashboardStats);
router.get("/report", DashboardController.getReport);

module.exports = router;
