const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BookingOnboarding = sequelize.define('BookingOnboarding', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  checklist: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  otpChannel: {
    type: DataTypes.ENUM('phone', 'email'),
    allowNull: true,
  },
  startedBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  otpSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'booking_onboardings'
});

module.exports = BookingOnboarding;