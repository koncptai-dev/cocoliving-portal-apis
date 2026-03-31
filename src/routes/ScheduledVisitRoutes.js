const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const ScheduledVisitController = require('../controllers/ScheduledVisitController');
const authorizeRole = require('../middleware/authorizeRole');

router.post('/', ScheduledVisitController.createScheduledVisit);
router.post('/make-a-visit', authMiddleware, ScheduledVisitController.createScheduledVisitFromApp);
router.get('/admin/getAll', authMiddleware, authorizeRole(1,3), ScheduledVisitController.getScheduledVisitList);

router.patch('/admin/:id/status', authMiddleware, authorizeRole(1,3), ScheduledVisitController.updateScheduledVisitStatus);
module.exports = router;