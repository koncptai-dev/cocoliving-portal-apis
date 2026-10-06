const BookRoomController=require('../controllers/BookRoomController');
const BookingPaymentController=require('../controllers/BookingPaymentController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");
const parentNotAllowed = require("../middleware/parentNotAllowed");

// user
router.get('/getUserBookings', authMiddleware,authorizeRole(2), BookRoomController.getUserBookings);
router.get('/meal-subscription/:bookingId', authMiddleware, authorizeRole(1,2,3), BookingPaymentController.getMealSubscription);
router.post("/requestCancellation/:bookingId",authMiddleware, parentNotAllowed, authorizeRole(2), BookRoomController.requestCancellation);
router.get('/active-booking', authMiddleware, authorizeRole(2), BookRoomController.getActiveBookingForUser );

module.exports=router