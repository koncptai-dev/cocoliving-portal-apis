const BookRoomController=require('../controllers/BookRoomController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.get('/getUserBookings', authMiddleware, BookRoomController.getUserBookings);
router.post("/requestCancellation/:bookingId",authMiddleware,BookRoomController.requestCancellation);
router.get('/active-booking', authMiddleware, BookRoomController.getActiveBookingForUser );

module.exports=router