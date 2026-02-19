const express = require('express');
const router = express.Router();
const { storeFcmToken,saveNotificationSettings,getNotifications } = require('../controllers/FcmController');
const authenticate  = require('../middleware/auth');


//for store fcm token
router.post('/store-fcm-token', authenticate, storeFcmToken);

//for save notification settings
router.post('/notification-settings',authenticate,saveNotificationSettings);

//for get notification loggedin user
router.get('/get-notifications', authenticate, getNotifications);



module.exports = router;    

