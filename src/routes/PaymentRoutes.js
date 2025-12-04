const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');
const authenticateToken = require('../middleware/auth');

router.get('/status/:merchantOrderId', authenticateToken, PaymentController.checkOrderStatus);

module.exports = router;