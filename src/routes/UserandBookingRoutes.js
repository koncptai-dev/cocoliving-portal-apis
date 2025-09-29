const express = require("express");
const router = express.Router();
const UserDetailsController = require("../controllers/UserandBookingDetails");
const authMiddleware = require("../middleware/auth");

router.get("/details/:id", authMiddleware, UserDetailsController.getUserDetailsWithBookings);

module.exports = router;
