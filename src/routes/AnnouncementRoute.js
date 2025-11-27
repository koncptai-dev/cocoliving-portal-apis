const express = require("express");
const router = express.Router();
const AnnouncementController = require('../controllers/AddAnnouncement');
const authMiddleware = require('../middleware/auth');
const {validateAnnouncement}=require('../middleware/validation');
const validate=require('../middleware/validateResult');

// create Route
router.post("/add", authMiddleware, validateAnnouncement, validate, AnnouncementController.createAnnouncement);
router.get("/getAll", authMiddleware, AnnouncementController.getAllAnnouncement);
router.delete("/delete/:announcementId", authMiddleware, AnnouncementController.deleteAnnouncement);
router.put("/edit/:announcementId",authMiddleware,AnnouncementController.editAnnouncement)

//get all usertypes from announcement
router.get("/getAllUserTypes",authMiddleware, AnnouncementController.getAllUserTypes);

//patch request to update announcement status
router.patch('/:id/toggle-status', AnnouncementController.toggleEventStatus);

//get user specific announcement
router.get('/user-announcements', authMiddleware, AnnouncementController.getAnnouncement);
module.exports = router;
