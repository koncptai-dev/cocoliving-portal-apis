const express = require("express");
const router = express.Router();
const UserByAdminController=require('../controllers/UsersByAdminController')
const authMiddleware = require('../middleware/auth');
const {addUserValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');

// create Route
router.post("/add",authMiddleware, addUserValidate, validate, UserByAdminController.AddUser);
router.get("/getAllUsers",authMiddleware, UserByAdminController.getAllUser);

// route for verifying registration token**
router.get("/verify-registration-token", UserByAdminController.verifyRegistrationToken);

//for admin user
router.post('/create-admin-user', authMiddleware, UserByAdminController.createAdminUser);
router.get("/getAlladminUsers",authMiddleware, UserByAdminController.getAllAdminUsers);
router.get("/getAdminById/:id", authMiddleware, UserByAdminController.getAdminById);
router.put("/admin/:id",authMiddleware,UserByAdminController.editAdminUser)
router.put("/toggle-status/:id", authMiddleware, UserByAdminController.toggleAdminStatus);

module.exports = router;
