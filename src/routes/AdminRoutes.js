const express = require("express");
const router = express.Router();
const AdminController = require("../controllers/AdminController");

// create Route
router.post("/create", AdminController.registerAdmin);
// router.post("/login", AdminController.loginAdmin);

module.exports = router;
