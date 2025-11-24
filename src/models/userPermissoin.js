  const {DataTypes}=require('sequelize');
  const sequelize = require('../config/database');
  const User = require("./user");
  const Page = require("./page");

  const UserPermission = sequelize.define("UserPermission", {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true, // ensures one row per user
      references: {
        model: User,
        key: "id"
      }
    },
    pages: {
      type: DataTypes.JSON, // ["1","2"] or ["dashboard","users"]
      allowNull: true
    },
    permissions: {
      type: DataTypes.JSON, // { "1":{"read":true,"write":true}, ... }
      allowNull: true
    },
    properties: {
      type: DataTypes.JSON,
      allowNull: true,
    },

  }, {
    tableName: "user_permissions",
    timestamps: true
  });

  module.exports = UserPermission;