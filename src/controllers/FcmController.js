const User = require('../models/user');
const sequelize = require('../config/database');

exports.storeFcmToken = async (req, res) => {
    try{
        const {fcmToken}=req.body;

        if(!fcmToken){
            return res.status(400).json({success:false,message:'FCM Token is required'})
        }

        const user=await User.findByPk(req.user.id);
        if(!user){
            return res.status(400).json({success:false,message:"User Not Found"})
        }

        user.fcmToken = fcmToken;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "FCM token stored successfully"
        });
    }catch(error){
        return res.status(500).json({success:false,message:"server error",error:error.message})
    }
}