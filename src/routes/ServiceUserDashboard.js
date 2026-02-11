const express = require("express");
const router = express.Router();
const { getServiceDashboard } = require("../controllers/ServiceUserDashboard");
const authenticateToken = require("../middleware/auth");

router.get("/dashboard", authenticateToken, getServiceDashboard);

module.exports = router;
