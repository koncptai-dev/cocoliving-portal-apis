const express = require("express");
const router = express.Router();
const AnnouncementController = require('../controllers/AddAnnouncement');
const authMiddleware = require('../middleware/auth');
const {validateAnnouncement}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const authorizeRole = require("../middleware/authorizeRole");

// create Route(admin)
router.post("/add", authMiddleware,authorizeRole(1,3), validateAnnouncement, validate, AnnouncementController.createAnnouncement);
router.get("/getAll", authMiddleware,authorizeRole(1,3), AnnouncementController.getAllAnnouncement);
router.delete("/delete/:announcementId", authMiddleware, authorizeRole(1,3), AnnouncementController.deleteAnnouncement);
router.put("/edit/:announcementId",authMiddleware,authorizeRole(1,3),AnnouncementController.editAnnouncement)

//get all usertypes from announcement(admin)
router.get("/getAllUserTypes",authMiddleware,authorizeRole(1,3), AnnouncementController.getAllUserTypes);

//patch request to update announcement status(admin)
router.patch('/:id/toggle-status',authorizeRole(1,3), AnnouncementController.toggleEventStatus);

//get user specific announcement
router.get('/user-announcements', authMiddleware, AnnouncementController.getAnnouncement);

module.exports = router;
