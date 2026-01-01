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
    pushNotifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    enableAll: { type: DataTypes.BOOLEAN, defaultValue: true },
    newsletters: { type: DataTypes.BOOLEAN, defaultValue: true },
    email: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "user_notification_settings",
    timestamps: true
  }
);

module.exports = UserNotificationSetting;
