const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BookingExtension = sequelize.define('BookingExtension', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'bookings', key: 'id' },
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },

  requestedMonths: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  oldCheckOutDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  newCheckOutDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  amountRupees: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  status: {
    type: DataTypes.ENUM('pending','approved','rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },

  paymentTransactionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
}, {
  tableName: 'booking_extensions',
});

module.exports = BookingExtension;