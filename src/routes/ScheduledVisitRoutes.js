const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const ScheduledVisitController = require('../controllers/ScheduledVisitController');

router.post('/', ScheduledVisitController.createScheduledVisit);
router.post('/make-a-visit', authMiddleware, ScheduledVisitController.createScheduledVisitFromApp);
router.get('/admin/getAll', authMiddleware, ScheduledVisitController.getScheduledVisitList);

router.patch('/admin/:id/status', authMiddleware, ScheduledVisitController.updateScheduledVisitStatus);
module.exports = router;