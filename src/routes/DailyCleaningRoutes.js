const DaliyTaskController = require('../controllers/DailyTaskController');
const express = require('express');
const   router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/add',upload.fields({ name: 'photos', maxCount: 10  }), authMiddleware, DaliyTaskController.submitDailyCleaning);

router.get('/getCleaning', authMiddleware, DaliyTaskController.getDailyCleaning);

module.exports = router