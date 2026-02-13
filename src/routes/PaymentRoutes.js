const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");

//user
router.get('/status/:merchantOrderId', authenticateToken,authorizeRole(2), PaymentController.checkOrderStatus);

//for admin,superadmin,user too
router.get('/user-transactions', authenticateToken,authorizeRole(1,2,3), PaymentController.getUserTransactions);
// admin
router.get('/transactions', authenticateToken, authorizeRole(1,3), PaymentController.getTransactions);
router.get('/refund-info/:transactionId',authenticateToken, authorizeRole(1,3), PaymentController.getRefundInfo);

module.exports = router;