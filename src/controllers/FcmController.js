const User = require('../models/user');
const UserNotificationSettings = require('../models/userNotificationSetting');
const sequelize = require('../config/database');
const admin = require('../Auth/firebase');
const { logApiCall } = require("../helpers/auditLog");
const Notification = require('../models/notifications');

//store fcm token
exports.storeFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            await logApiCall(req, res, 400, "Stored FCM token - token required", "fcm", req.user?.id || 0);
            return res.status(400).json({ success: false, message: 'FCM Token is required' })
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            await logApiCall(req, res, 400, "Stored FCM token - user not found", "fcm", req.user?.id || 0);
            return res.status(400).json({ success: false, message: "User Not Found" })
        }

        user.fcmToken = fcmToken;
        await user.save();

        await logApiCall(req, res, 200, "Stored FCM token successfully", "fcm", user.id);
        return res.status(200).json({
            success: true,
            message: "FCM token stored successfully"
        });
    } catch (error) {
        await logApiCall(req, res, 500, "Error occurred while storing FCM token", "fcm", req.user?.id || 0);
        return res.status(500).json({ success: false, message: "server error", error: error.message })
    }
}

//store notification setting first
exports.saveNotificationSettings = async (req, res) => {
    try {
        const {pushNotifications, enableAll, newsletters, email } = req.body;
        const userId = req.user.id;

        let settings = await UserNotificationSettings.findOne({ where: { userId } });

        if (!settings) {
            settings = await UserNotificationSettings.create({
                userId,
                pushNotifications: pushNotifications ?? true,
                enableAll: enableAll ?? true,
                newsletters: newsletters ?? true,
                email: email ?? true
            });
            return res.status(201).json({
                success: true,
                created: true,
                message: "Notification settings created successfully",
                data: settings
            });
        } else {
            await settings.update({
                ...(pushNotifications !== undefined && { pushNotifications }),
                ...(enableAll !== undefined && { enableAll }),
                ...(newsletters !== undefined && { newsletters }),
                ...(email !== undefined && { email })
            });
        }
        return res.status(200).json({ success: true, message: "Notification settings updated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

//fetch notification api for user

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id; 

        // Fetch only user's own notifications
        const notifications = await Notification.findAll({
            where: { userId: userId },  
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'title', 'message', 'notificationKey', 'createdAt']
        });

        return res.status(200).json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

