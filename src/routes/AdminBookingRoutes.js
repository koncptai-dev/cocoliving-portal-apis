const AdminBooking=require('../controllers/AdminBooking');
const express = require('express');
const router = express.Router();


// Booking Actions
router.get('/getallBookings', AdminBooking.getAllBookings);
router.patch('/approveBooking/:bookingId', AdminBooking.approveBooking);
router.patch('/rejectBooking/:bookingId', AdminBooking.rejectBooking);
router.patch('/cancelBooking/:bookingId', AdminBooking.cancelBooking);
router.patch('/approveCancellation/:bookingId',AdminBooking.approveCancellation);
router.patch('/rejectCancellation/:bookingId',AdminBooking.rejectCancellation);
router.patch('/:bookingId/assign-room', AdminBooking.assignRoom);
router.post("/:bookingId/assign-inventory", AdminBooking.assignInventory);
// Booking Extension Actions
router.get('/getExtension/:bookingId',AdminBooking.getPendingBookingExtension);
router.patch('/approveExtension/:extensionId', AdminBooking.approveExtension);
router.patch('/rejectExtension/:extensionId', AdminBooking.rejectExtension);

module.exports=router