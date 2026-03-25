const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const GuestVisitController = require('../controllers/GuestVisitController');
const authorizeRole = require('../middleware/authorizeRole');
const authorizePage = require('../middleware/authorizePage');

router.post('/', authMiddleware, GuestVisitController.createGuestVisit);
router.post('/scan', authMiddleware, GuestVisitController.scanQrAndCheckIn);
router.post('/:id/checkout', authMiddleware, GuestVisitController.checkOutGuest);

router.get('/user', authMiddleware, authorizeRole(1,2,3), GuestVisitController.getUserGuestVisits);
router.get('/property', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.getPropertyGuestVisits);
router.get('/admin', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.getAdminGuestVisits);
router.get('/export-csv', authMiddleware, authorizeRole(1,3), authorizePage("GuestVisit Management", "read"), GuestVisitController.exportVisitsCsv);

module.exports = router;