const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");

const Notification = sequelize.define("Notification", {
   userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  notificationKey: {
    type: DataTypes.STRING,  
    allowNull: true         // newsletter | push | email | event
  },
},
  {
    tableName: "notifications",
    timestamps: true
  }
);

module.exports = Notification;
