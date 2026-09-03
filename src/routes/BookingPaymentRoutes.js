const express = require('express');
const router = express.Router();
const BookingPaymentController = require('../controllers/BookingPaymentController');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");
const parentNotAllowed = require("../middleware/parentNotAllowed");

// user
router.post('/initiate', authenticateToken, parentNotAllowed, authorizeRole(2), BookingPaymentController.initiate);

// user
router.post('/initiate-remaining', authenticateToken, parentNotAllowed, authorizeRole(2), BookingPaymentController.initiateRemaining);

// user
router.post('/initiate-security-deposit', authenticateToken, parentNotAllowed, authorizeRole(2), BookingPaymentController.initiateSecurityDeposit);

// user
router.post('/initiate-monthly-rent', authenticateToken, parentNotAllowed, authorizeRole(2), BookingPaymentController.initiateMonthlyRent);

// admin
router.post('/refund', authenticateToken, authorizeRole(1,3), BookingPaymentController.initiateRefund);

// admin
router.get('/refund/:merchantRefundId/status', authenticateToken,authorizeRole(1,3), BookingPaymentController.getRefundStatus);

// admin also for user
router.get('/:bookingId/summary', authenticateToken,authorizeRole(1,2,3), BookingPaymentController.getBookingPaymentSummary);

// user
router.post('/initiate-extension',authenticateToken,parentNotAllowed,authorizeRole(2),BookingPaymentController.initiateExtension);

router.post('/initiate-electricity-recharge', authenticateToken, BookingPaymentController.initiateElectricityRecharge );

module.exports = router;