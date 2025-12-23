const express = require('express');
const router = express.Router();
const { storeFcmToken,sendPushNotification,saveNotificationSettings } = require('../controllers/FcmController');
const authenticate  = require('../middleware/auth');

//for store fcm token
router.post('/store-fcm-token', authenticate, storeFcmToken);

//for save notification settings
router.post('/notification-settings',authenticate,saveNotificationSettings);

//for send notification
router.post('/send-notification',authenticate,sendPushNotification);


module.exports = router;    