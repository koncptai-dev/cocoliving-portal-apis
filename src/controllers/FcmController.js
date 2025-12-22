const User = require('../models/user');
const sequelize = require('../config/database');
const admin = require('../Auth/firebase');
const { logApiCall } = require("../helpers/auditLog");

exports.storeFcmToken = async (req, res) => {
    try{
        const {fcmToken}=req.body;

        if(!fcmToken){
            await logApiCall(req, res, 400, "Stored FCM token - token required", "fcm", req.user?.id || 0);
            return res.status(400).json({success:false,message:'FCM Token is required'})
        }

        const user=await User.findByPk(req.user.id);
        if(!user){
            await logApiCall(req, res, 400, "Stored FCM token - user not found", "fcm", req.user?.id || 0);
            return res.status(400).json({success:false,message:"User Not Found"})
        }

        user.fcmToken = fcmToken;
        await user.save();

        await logApiCall(req, res, 200, "Stored FCM token successfully", "fcm", user.id);
        return res.status(200).json({
            success: true,
            message: "FCM token stored successfully"
        });
    }catch(error){
        await logApiCall(req, res, 500, "Error occurred while storing FCM token", "fcm", req.user?.id || 0);
        return res.status(500).json({success:false,message:"server error",error:error.message})
    }
}

//push notification 
exports.sendPushNotification = async (req, res) => {
    try {
        const {  title, body, data } = req.body;
        const userid=req.user.id;

        const user = await User.findByPk(userid);
        if (!user || !user.fcmToken) {
            return res.status(404).json({ success: false, message: "User not found or FCM token missing" });
        }

        const message = {
            token: user.fcmToken,
            notification: { title, body },
            data: data || {}, // optional key value data
        };
        const response = await admin.messaging().send(message);

        return res.status(200).json({
            success: true,
            message: "Notification sent successfully",
            response
        });
    
    }catch(error){
        await logApiCall(req, res, 500, "Error occurred while storing FCM token", "fcm", req.user?.id || 0);
        return res.status(500).json({success:false,message:"server error",error:error.message})
    }
}