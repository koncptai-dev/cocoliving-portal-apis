const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Rooms = require("./rooms");
const User = require("./user");

const Booking = sequelize.define(
  "Booking",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },

    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Rooms,
        key: "id",
      },
    },

    checkInDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    checkOutDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    monthlyRent: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    depositAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "booked", 
    },
  },
  {
    tableName: "bookings",
  }
);



module.exports = Booking;
