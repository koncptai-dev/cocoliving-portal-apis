const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const GuestVisitController = require('../controllers/GuestVisitController');
const authorizeRole = require('../middleware/authorizeRole');
const authorizePage = require('../middleware/authorizePage');
const parentNotAllowed = require("../middleware/parentNotAllowed");

router.post('/', authMiddleware, parentNotAllowed, GuestVisitController.createGuestVisit);
router.post('/scan', authMiddleware, authorizeRole(1,3), GuestVisitController.scanQrAndCheckIn);
router.post('/:id/checkout', authMiddleware, authorizeRole(1,3), GuestVisitController.checkOutGuest);

router.get('/user', authMiddleware, authorizeRole(1,2,3), GuestVisitController.getUserGuestVisits);
router.get('/property', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.getPropertyGuestVisits);
router.get('/admin', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.getAdminGuestVisits);
router.get('/export-csv', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.exportVisitsCsv);

module.exports = router;