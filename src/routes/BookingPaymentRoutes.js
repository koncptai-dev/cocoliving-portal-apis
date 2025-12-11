const express = require('express');
const router = express.Router();
const BookingPaymentController = require('../controllers/BookingPaymentController');
const authenticateToken = require('../middleware/auth');

router.post('/initiate', authenticateToken, BookingPaymentController.initiate);

router.post('/initiate-remaining', authenticateToken, BookingPaymentController.initiateRemaining);

router.post('/refund', authenticateToken, BookingPaymentController.refund);

router.get('/refund/:merchantRefundId/status', authenticateToken, BookingPaymentController.getRefundStatus);

router.get('/:bookingId/summary', BookingPaymentController.getBookingPaymentSummary);

module.exports = router;