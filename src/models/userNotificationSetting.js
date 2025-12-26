const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");

const UserNotificationSetting = sequelize.define(
  "UserNotificationSetting",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id"
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    },
    pushEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    notificationPreferences: {
      type: DataTypes.JSON,
      defaultValue: {} // initially empty
    }
  },
  {
    tableName: "user_notification_settings",
    timestamps: true
  }
);

module.exports = UserNotificationSetting;
