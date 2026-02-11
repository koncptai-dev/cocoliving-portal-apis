const express = require('express');
const router = express.Router();

const ScheduledVisitController = require('../controllers/ScheduledVisitController');

router.post('/', ScheduledVisitController.createScheduledVisit);

module.exports = router;