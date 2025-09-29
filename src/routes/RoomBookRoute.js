const BookRoomController=require('../controllers/BookRoomController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

//user
router.post('/add', authMiddleware, BookRoomController.createBooking);
router.get('/getUserBookings', authMiddleware, BookRoomController.getUserBookings);
router.put("/bookings/:id/cancel", authMiddleware, BookRoomController.cancelBooking);


module.exports=router