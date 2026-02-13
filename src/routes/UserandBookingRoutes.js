const express = require("express");
const router = express.Router();
const UserDetailsController = require("../controllers/UserandBookingDetails");
const authMiddleware = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");

// admin
router.get("/details/:id", authMiddleware,authorizeRole(1,3), UserDetailsController.getUserDetailsWithBookings);

module.exports = router;
