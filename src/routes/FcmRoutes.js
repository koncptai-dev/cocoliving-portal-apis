const express = require('express');
const router = express.Router();
const { storeFcmToken } = require('../controllers/FcmController');
const authenticate  = require('../middleware/auth');

router.post('/store-fcm-token', authenticate, storeFcmToken);

module.exports = router;