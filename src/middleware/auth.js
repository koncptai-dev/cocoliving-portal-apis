const jwt=require('jsonwebtoken');
const User = require('../models/user');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
    const authHeader=req.headers['authorization'];

    if(!authHeader){
        return res.status(403).json({ message: 'No Token Provided' });
    }

    const token=authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Unauthorized Access' });
        }

        const dbUser = await User.findByPk(user.id);

        if (!dbUser) {
            return res.status(403).json({ message: 'User not found' });
        }

        req.user = dbUser;
        next();
    });
}

module.exports = authenticateToken; 