const jwt=require('jsonwebtoken');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
    const authHeader=req.headers['authorization'];

    if(!authHeader){
        return res.status(403).json({ message: 'No Token Provided' });
    }

    const token=authHeader.split(' ')[1];

    jwt.verify(token,process.env.JWT_SECRET, (err, user) => {   
        if(err){
            console.log("JWT error",err);
            return res.status(403).json({message:'Unauthorized Access'});
        }
        req.user=user; //user info
        next();
    })
}

module.exports = authenticateToken; 