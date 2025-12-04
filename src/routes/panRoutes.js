const express = require('express');
const router = express.Router();
const { verifyPAN } = require('../controllers/panController');
const panLimiter = require('../utils/ratelimiter');
const authenticateToken = require("../middleware/auth");


router.post('/verify-pan', authenticateToken, panLimiter, verifyPAN);

module.exports = router;