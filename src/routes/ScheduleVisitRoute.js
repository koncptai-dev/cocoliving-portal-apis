const ScheduleVisitController  = require('../controllers/ScheduleVisitController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.get('/admin/getAll', authMiddleware,ScheduleVisitController.getScheduleVisitList);

module.exports = router