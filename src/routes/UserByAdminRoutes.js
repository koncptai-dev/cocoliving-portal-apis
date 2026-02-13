const express = require("express");
const router = express.Router();
const UserByAdminController=require('../controllers/UsersByAdminController')
const authMiddleware = require('../middleware/auth');
const {addUserValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const authorizePage = require("../middleware/authorizePage");
const authorizeRole = require("../middleware/authorizeRole");


// create Route
router.post("/add",authMiddleware, addUserValidate, validate, UserByAdminController.AddUser);
router.get("/getAllUsers",authMiddleware,authorizeRole(1,3),authorizePage("User Management","read"), UserByAdminController.getAllUser);
router.get('/getNormalUsers', authMiddleware, authorizeRole(1,3), UserByAdminController.getNormalUsers);

//for admin user
router.post('/create-admin-user', authMiddleware, UserByAdminController.createAdminUser);
router.get("/getAlladminUsers",authMiddleware, UserByAdminController.getAllAdminUsers);
router.get("/getAdminById/:id", authMiddleware, UserByAdminController.getAdminById);
router.put("/admin/:id",authMiddleware,UserByAdminController.editAdminUser)
router.put("/toggle-status/:id", authMiddleware, UserByAdminController.toggleAdminStatus);

module.exports = router;
