const BookRoomController=require('../controllers/BookRoomController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.post('/add', authMiddleware, BookRoomController.createBooking);

//admin
router.get('/admin/getallBookings', BookRoomController.getAllBookings);
module.exports=router