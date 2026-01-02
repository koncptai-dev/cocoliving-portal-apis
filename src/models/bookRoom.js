const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./user');
const PropertyRateCard = require('./propertyRateCard');
const Room = require('./rooms');

const Booking = sequelize.define(
  'Booking',
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
      references: { model: User, key: 'id' },
    },

    rateCardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: PropertyRateCard, key: 'id' }, 
    },

    roomType: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Room, key: 'id' },
    },
    assignedItems: {
      type: DataTypes.JSON,
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
      defaultValue: 'pending',
    },

    totalAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total amount in Rupees (monthlyRent * duration + security deposit i.e. monthRent*2)',
    },

    remainingAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Remaining amount in Rupees',
    },

    bookingType: {
      type: DataTypes.ENUM('PREBOOK', 'BOOK'),
      allowNull: false,
      defaultValue:'BOOK',
    },

    paymentStatus: {
      type: DataTypes.ENUM('INITIATED', 'PARTIAL', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'INITIATED',
    },
    onboardingStatus: {
      type: DataTypes.ENUM('NOT_INITIATED', 'INITIATED', 'OTP_PENDING', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'NOT_INITIATED'
    },
    cancelRequestStatus: {
      type: DataTypes.ENUM('NONE','PENDING','APPROVED','REJECTED'),
      allowNull: false,
      defaultValue:'NONE',
    },
    userCancelReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    adminCancelReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cancelEffectiveCheckOutDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },

  {
    tableName: 'bookings',
  }
);

module.exports = Booking;
