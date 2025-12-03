const express = require('express');
const router = express.Router();
const BookingPaymentController = require('../controllers/BookingPaymentController');
const authenticateToken = require('../middleware/auth');

router.post('/initiate', authenticateToken, BookingPaymentController.initiate);

router.get('/:bookingId/summary', BookingPaymentController.getBookingPaymentSummary);

module.exports = router;