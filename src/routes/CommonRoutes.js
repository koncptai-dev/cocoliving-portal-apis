const express = require("express");
const router = express.Router();
const CommonController = require("../controllers/commonController");
const {validateLogin}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const authenticateToken =  require('../middleware/auth');

// create Route
router.post("/login", validateLogin, validate, CommonController.login);
router.post('/forgot-password', CommonController.sendResetCode);
router.post('/reset-password', CommonController.resetPassword);
router.post('/change-password',authenticateToken,CommonController.changePassword)

module.exports = router;
