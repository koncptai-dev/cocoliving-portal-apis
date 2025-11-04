const express = require("express");
const router = express.Router();
const UserByAdminController=require('../controllers/UsersByAdminController')
const authMiddleware = require('../middleware/auth');
const {addUserValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');

// create Route
router.post("/add",authMiddleware, addUserValidate, validate, UserByAdminController.AddUser);
router.get("/getAllUsers",authMiddleware, UserByAdminController.getAllUser);


//for admin user
router.post('/create-admin-user', authMiddleware, UserByAdminController.createAdminUser);
router.get("/getAlladminUsers",authMiddleware, UserByAdminController.getAllAdminUsers);
router.get("/getAdminById/:id", authMiddleware, UserByAdminController.getAdminById);


module.exports = router;
