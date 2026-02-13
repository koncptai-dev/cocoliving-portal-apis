const DaliyTaskController = require('../controllers/DailyTaskController');
const express = require('express');
const   router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const authorizeRole = require('../middleware/authorizeRole');

// for service-member to submit daily cleaning report with photos and tasks
router.post('/add',upload.fields({ name: 'photos', maxCount: 10  }), authMiddleware,authorizeRole(4), DaliyTaskController.submitDailyCleaning);

// for service-member to get list 
router.get('/getCleaning', authMiddleware,authorizeRole(4), DaliyTaskController.getDailyCleaning);

module.exports = router