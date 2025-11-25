const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");
const PropertyRateCard = require("./propertyRateCard");
const Room = require("./rooms");

const Booking = sequelize.define(
  "Booking",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },

    rateCardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: PropertyRateCard, key: "id" }, 
    },

    roomType: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,     //  Admin  assign later
      references: { model: Room, key: "id" },
    },
    assignedItems: {
      type: DataTypes.JSON,   // stores array of item IDs: [1,5,7]
      allowNull: true,
      defaultValue: [],
    },

    checkInDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    checkOutDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    monthlyRent: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",  
    },
  },

  {
    tableName: "bookings",
  }
);

module.exports = Booking;
