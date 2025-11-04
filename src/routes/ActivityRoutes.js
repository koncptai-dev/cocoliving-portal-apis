const express = require("express");
const router = express.Router();
const ActivityController = require("../controllers/ActivityController");
const authMiddleware = require('../middleware/auth');

router.get("/recent", authMiddleware, ActivityController.getRecentActivities);

module.exports = router;
