const rateLimit = require('express-rate-limit');

// can request 5 requests in 5 minutes

const panLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // limit each IP to 5 requests
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many PAN verification requests from this IP. Please try again after 5 minutes.',
    statusCode: 429, 
});

module.exports = panLimiter;