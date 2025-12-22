const express = require("express");
const router = express.Router();
const CommonController = require("../controllers/commonController");
const {validateLogin}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const authenticateToken =  require('../middleware/auth');

// create Route
router.post("/login", validateLogin, validate, CommonController.login);

router.post("/check-email", CommonController.checkEmail);

// user otp login   
router.post('/login/request-otp', CommonController.sendLoginOtp);
router.post('/login/verify-otp', CommonController.verifyLoginOtp);


module.exports = router;
