const express = require('express');
const router = express.Router();
const BookingPaymentController = require('../controllers/BookingPaymentController');
const authenticateToken = require('../middleware/auth');

console.log('>>> BookingPaymentRoutes ROUTER file loaded');

router.use((req, res, next) => {
  console.log('>>> booking-payments ROUTE MATCHED:', req.method, req.url);
  next();
});

router.post('/initiate', authenticateToken, BookingPaymentController.initiate);

router.get('/:bookingId/summary', BookingPaymentController.getBookingPaymentSummary);

module.exports = router;
