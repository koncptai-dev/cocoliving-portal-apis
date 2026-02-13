const express = require("express");
const router = express.Router();
const ActivityController = require("../controllers/ActivityController");
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");

//superadmin
router.get("/recent", authMiddleware,authorizeRole(1,3), ActivityController.getRecentActivities);

module.exports = router;
