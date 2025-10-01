const UserController= require('../controllers/UserController');
const express = require('express');
const {validateSignup,editUserProfileValidator}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const router = express.Router();
const authenticateToken =  require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/register',validateSignup,validate,UserController.registerUser);
router.put('/update-profile/:id', upload.single('profileImage'),editUserProfileValidator,validate,authenticateToken,UserController.editUserProfile);
router.delete('/delete-account/:id', authenticateToken, UserController.deleteAccount);
router.get('/getUser/:id', authenticateToken, UserController.getUserById);

// router.post('/login', UserController.loginUser);
// router.post('/forgot-password', UserController.sendResetCode);
// router.post('/reset-password', UserController.resetPassword);

module.exports = router;
