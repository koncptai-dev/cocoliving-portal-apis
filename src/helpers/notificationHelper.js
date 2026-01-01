const User = require('../models/user');
const UserNotificationSettings = require('../models/userNotificationSetting');
const sequelize = require('../config/database');
const admin = require('../Auth/firebase');
const { logApiCall } = require("../helpers/auditLog");
const Notification = require('../models/notifications');

//push notification 
exports.sendPushNotification = async (userId, title, body, data = {}, type) => {
    try {

        const user = await User.findByPk(userId);
        if (!user || !user.fcmToken) {
            return false;
        }

        // Fetch or create notification settings
        let settings = await UserNotificationSettings.findOne({ where: { userId } });
        if (!settings) {
            settings = await UserNotificationSettings.create({
                userId,
                pushNotifications: true,
                enableAll: true,
                newsletters: true,
                email: true
            });
        }
        console.log('Notification settings for user:', userId, settings.toJSON());

        //check for global push disable
        if (!settings.enableAll) {
            console.log(`All notifications disabled globally for user ${userId}`);
            return false;
        }
        // Type-specific check from JSON
        const typeMapping = {
            pushNotifications: 'pushNotifications',
            email: 'email',
            newsletters: 'newsletters'
        };

        const settingField = typeMapping[type];
        if (settingField && !settings[settingField]) {
            console.log(`User ${userId} has disabled ${type} notifications`);
            return false;
        }

        const message = {
            token: user.fcmToken,
            notification: { title, body },
            data: data || {}, // optional key value data
        };

        //send notification 
        await admin.messaging().send(message);
        console.log(`Notification sent to user ${userId}: ${title} - ${body}`);

        // Check if notification already exists (duplicate prevention)
        const exists = await Notification.findOne({
            where: { userId, title, message: body, notificationKey: type }
        });
        if (!exists) {
            await Notification.create({ userId, title, message: body, notificationKey: type });
        }

        return true; //when successfully sent

    } catch (error) {
        const firebaseError = error?.errorInfo?.code;
        if (firebaseError) {
            const cleanMsg = firebaseError.replace('messaging/', '').replace(/-/g, ' ');
            console.error(`Firebase error for user ${userId}: ${cleanMsg}`);
            return false;
        }
        console.error(`Error sending notification to user ${userId}:`, error.message);
        return false;
    }
}

