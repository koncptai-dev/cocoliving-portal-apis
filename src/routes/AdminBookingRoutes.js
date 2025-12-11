const AdminBooking=require('../controllers/AdminBooking');
const express = require('express');
const router = express.Router();


//admin
router.get('/getallBookings', AdminBooking.getAllBookings);
router.patch('/approveBooking/:bookingId', AdminBooking.approveBooking);
router.patch('/rejectBooking/:bookingId', AdminBooking.rejectBooking);
router.patch('/cancelBooking/:bookingId', AdminBooking.cancelBooking);
router.patch('/:bookingId/assign-room', AdminBooking.assignRoom);
router.post("/:bookingId/assign-inventory", AdminBooking.assignInventory);

module.exports=router