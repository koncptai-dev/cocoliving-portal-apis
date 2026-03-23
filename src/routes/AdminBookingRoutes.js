const AdminBooking=require('../controllers/AdminBooking');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const authorizePage = require('../middleware/authorizePage');

// Booking Actions
router.get('/getallBookings',authMiddleware, AdminBooking.getAllBookings);
router.patch('/approveBooking/:bookingId', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.approveBooking);
router.patch('/rejectBooking/:bookingId', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.rejectBooking);
router.patch('/cancelBooking/:bookingId', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.cancelBooking);
router.patch('/approveCancellation/:bookingId',authMiddleware,authorizeRole(1,3),authorizePage("Bookings", "write"),AdminBooking.approveCancellation);
router.patch('/rejectCancellation/:bookingId',authMiddleware,authorizeRole(1,3),authorizePage("Bookings", "write"),AdminBooking.rejectCancellation);
router.patch('/:bookingId/assign-room', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.assignRoom);
router.post("/:bookingId/assign-set", authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.assignInventory);
router.get( "/inventory/sets/:propertyId/:roomId", authMiddleware, AdminBooking.getInventorySets);
// Booking Extension Actions
router.get('/getExtension/:bookingId',authMiddleware, AdminBooking.getPendingBookingExtension);
router.patch('/approveExtension/:extensionId', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.approveExtension);
router.patch('/rejectExtension/:extensionId', authMiddleware, authorizeRole(1,3),authorizePage("Bookings", "write"), AdminBooking.rejectExtension);

module.exports=router