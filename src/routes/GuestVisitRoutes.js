const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const GuestVisitController = require('../controllers/GuestVisitController');

router.post('/', auth, GuestVisitController.createGuestVisit);
router.post('/scan', auth, GuestVisitController.scanQrAndCheckIn);
router.post('/:id/checkout', auth, GuestVisitController.checkOutGuest);

router.get('/user', auth, GuestVisitController.getUserGuestVisits);
router.get('/property', auth, GuestVisitController.getPropertyGuestVisits);
router.get('/admin', auth, GuestVisitController.getAdminGuestVisits);

module.exports = router;