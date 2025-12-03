const BookRoomController=require('../controllers/BookRoomController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

//user

// ⚠️ DO NOT use /api/book-room/add anymore — booking is created ONLY after successful payment. (see comment in BookRoomController above exports.createBooking for current flow )

// router.post('/add', authMiddleware, BookRoomController.createBooking);
router.get('/getUserBookings', authMiddleware, BookRoomController.getUserBookings);
router.put("/bookings/:id/cancel", authMiddleware, BookRoomController.cancelBooking);


module.exports=router