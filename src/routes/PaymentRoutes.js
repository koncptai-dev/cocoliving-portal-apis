const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');
const authenticateToken = require('../middleware/auth');

router.get('/status/:merchantOrderId', authenticateToken, PaymentController.checkOrderStatus);
router.get('/user-transactions', authenticateToken, PaymentController.getUserTransactions);
router.get('/transactions', authenticateToken, PaymentController.getTransactions);
router.get('/refund-info/:transactionId',authenticateToken, PaymentController.getRefundInfo);
module.exports = router;