const AdminBooking=require('../controllers/AdminBooking');
const express = require('express');
const router = express.Router();


//admin
router.get('/getallBookings', AdminBooking.getAllBookings);
router.patch('/approveBooking/:bookingId', AdminBooking.approveBooking);
router.patch('/rejectBooking/:bookingId', AdminBooking.rejectBooking);


module.exports=router