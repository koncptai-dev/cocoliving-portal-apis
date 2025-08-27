const express = require("express");
const router = express.Router();
const UserByAdminController=require('../controllers/UsersByAdminController')
const authMiddleware = require('../middleware/auth');
const {addUserValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');

// create Route
router.post("/add",authMiddleware, addUserValidate, validate, UserByAdminController.AddUser);

module.exports = router;
