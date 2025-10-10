const express = require('express');
const router = express.Router();
const pagesController = require('../controllers/pagesController');
const authMiddleware = require('../middleware/auth');

router.post('/create', pagesController.createPage);
router.get('/getAll', authMiddleware, pagesController.getPages);

module.exports = router;
