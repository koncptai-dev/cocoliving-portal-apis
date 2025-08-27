const express = require("express");
const router = express.Router();
const AnnouncementController = require('../controllers/AddAnnoucement');
const authMiddleware = require('../middleware/auth');
const {validateAnnouncement}=require('../middleware/validation');
const validate=require('../middleware/validateResult');

// create Route
router.post("/add",authMiddleware, validateAnnouncement, validate, AnnouncementController.createAnnouncement);
router.get("/getAll", AnnouncementController.getAllAnnouncement);

module.exports = router;
