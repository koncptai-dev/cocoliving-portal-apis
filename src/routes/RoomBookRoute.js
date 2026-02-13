const BookRoomController=require('../controllers/BookRoomController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");

// user
router.get('/getUserBookings', authMiddleware,authorizeRole(2), BookRoomController.getUserBookings);
router.post("/requestCancellation/:bookingId",authMiddleware,authorizeRole(2), BookRoomController.requestCancellation);
router.get('/active-booking', authMiddleware, authorizeRole(2), BookRoomController.getActiveBookingForUser );

module.exports=router