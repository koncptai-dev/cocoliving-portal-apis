const User = require('../models/user');
const UserNotificationSettings = require('../models/userNotificationSetting');
const sequelize = require('../config/database');
const admin = require('../Auth/firebase');
const { logApiCall } = require("../helpers/auditLog");

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
        const { pushEnabled, notificationPreferences } = req.body;
        const userId = req.user.id;

        let settings = await UserNotificationSettings.findOne({ where: { userId } });

        if (!settings) {
            settings = await UserNotificationSettings.create({
                userId,
                pushEnabled: pushEnabled ?? true,
                notificationPreferences: notificationPreferences ?? {}
            });
            return res.status(201).json({
                success: true,
                created: true,
                message: "Notification settings created successfully",
                data: createdSettings
            });
        } else {
            await settings.update({
                ...(pushEnabled !== undefined && { pushEnabled }),
                ...(notificationPreferences !== undefined && { notificationPreferences })
            });
        }
        return res.status(200).json({ success: true, message: "Notification settings updated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

//push notification 
exports.sendPushNotification = async (req, res) => {
    try {
        const { title, body, data, type } = req.body;
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) {
            await logApiCall(req, res, 404, "User not found", "notification", userId);
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (!user.fcmToken) {
            await logApiCall(req, res, 200, "FCM token missing", "notification", userId);
            return res.status(200).json({ success: true, sent: false, message: "FCM token missing" });
        }

        // Fetch or create notification settings
        let settings = await UserNotificationSettings.findOne({ where: { userId } });
        if (!settings) {
            settings = await UserNotificationSettings.create({
                userId,
                pushEnabled: true,
                notificationPreferences: {}
            });
        }

        //check for global push disable
        if (!settings.pushEnabled) {
            await logApiCall(req, res, 200, `Notification skipped: push disabled`, "notification", userId);
            return res.status(200).json({ success: true, sent: false });
        }
        // Type-specific check from JSON
        if (type && settings.notificationPreferences?.[type] === false) {
            await logApiCall(req, res, 200, `${type} notification skipped - user disabled`, "notification", userId);
            return res.status(200).json({ success: true, sent: false });
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

    } catch (error) {
        const firebaseError = error?.errorInfo?.code;
        if (firebaseError) {
            const cleanMsg = firebaseError.replace('messaging/', '').replace(/-/g, ' ');
            return res.status(500).json({ success: false, message: `Firebase Error: ${cleanMsg}`, error: firebaseError });
        }
        await logApiCall(req, res, 500, "Error occurred while sending push notification", "notification", req.user?.id || 0);
        console.log(error.message);
        return res.status(500).json({ success: false, message: "server error", error: error.message })

    }
}

