const UserController= require('../controllers/UserController');
const express = require('express');
const {validateSignup,editUserProfileValidator}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const router = express.Router();
const authenticateToken =  require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/register',upload.single('profileImage'), validateSignup,validate,UserController.registerUser);
router.put('/update-profile/:id',authenticateToken, upload.single('profileImage'),editUserProfileValidator,validate,UserController.editUserProfile);
router.get('/getUser/:id', authenticateToken, UserController.getUserById);
router.post('/send-otp',UserController.sendOTP);

// Send OTP to phone
router.post('/profile/verify/send-otp', authenticateToken, UserController.sendProfileOTP);

// Verify OTP from phone
router.post('/profile/verify/verify-otp', authenticateToken, UserController.verifyProfileOTP);

router.delete('/delete-account/:id', authenticateToken, UserController.deleteAccount);

module.exports = router;
