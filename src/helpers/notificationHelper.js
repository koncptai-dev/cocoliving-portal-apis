const User = require('../models/user');
const UserNotificationSettings = require('../models/userNotificationSetting');
const sequelize = require('../config/database');
const admin = require('../Auth/firebase');
const { logApiCall } = require("../helpers/auditLog");
const Notification = require('../models/notifications');

//push notification 
exports.sendPushNotification = async (userId, title, body, data = {}, type) => {
    console.log("\n================ PUSH NOTIFICATION START ================");
    console.log({ userId, title, body, type, data });

    try {
        const user = await User.findByPk(userId);

        if (!user) {
            console.log("❌ User not found:", userId);
            return false;
        }

        if (!user.fcmToken) {
            console.log("❌ Missing FCM token for user:", userId);
            return false;
        }

        console.log("✅ User found. FCM Token:", user.fcmToken);

        // Fetch or create notification settings
        let settings = await UserNotificationSettings.findOne({ where: { userId } });

        if (!settings) {
            console.log("⚠️ No settings found. Creating default...");
            settings = await UserNotificationSettings.create({
                userId,
                pushNotifications: true,
                enableAll: true,
                newsletters: true,
                email: true
            });
        }

        console.log("📌 Notification settings:", settings.toJSON());

        if (!settings.enableAll) {
            console.log("❌ Global notifications disabled for user:", userId);
            return false;
        }

        const typeMapping = {
            pushNotifications: 'pushNotifications',
            email: 'email',
            newsletters: 'newsletters'
        };

        const settingField = typeMapping[type];

        if (settingField && !settings[settingField]) {
            console.log(`❌ ${type} notifications disabled for user ${userId}`);
            return false;
        }

        const message = {
            token: user.fcmToken,
            notification: { title, body },
            data: data || {},
        };

        console.log("📤 Prepared Firebase message:", message);

        // Duplicate check
        console.log("🔍 Checking duplicate notification...");
        const exists = await Notification.findOne({
            where: { userId, title, message: body, notificationKey: type }
        });

        // if (exists) {
        //     console.log("⚠️ Duplicate notification blocked");
        //     return false;
        // }

        console.log("🚀 Sending notification via Firebase...");

        await admin.messaging().send(message);

        console.log(`✅ Notification sent to user ${userId}`);

        await Notification.create({
            userId,
            title,
            message: body,
            notificationKey: type
        });

        console.log("📝 Notification saved in DB");

        console.log("================ PUSH NOTIFICATION END ================\n");

    } catch (error) {
        const firebaseError = error?.errorInfo?.code;

        if (firebaseError) {
            const cleanMsg = firebaseError.replace('messaging/', '').replace(/-/g, ' ');
            console.error(`🔥 Firebase error for user ${userId}:`, cleanMsg);
            return false;
        }

        console.error(`🔥 General error for user ${userId}:`, error);
        return false;
    }
};