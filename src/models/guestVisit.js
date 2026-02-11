const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Booking = require('./bookRoom');
const User = require('./user');
const Room = require('./rooms');

const GuestVisit = sequelize.define(
  'GuestVisit',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    permitType: {
      type: DataTypes.ENUM('guest', 'worker'),
      allowNull: false,
    },

    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: 'id' },
    },

    createdByRole: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Booking, key: 'id' },
    },

    residentUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: User, key: 'id' },
    },

    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Room, key: 'id' },
    },

    guestName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    guestPhone: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    guestEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    visitDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    purpose: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    qrToken: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    qrGeneratedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    qrExpiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    qrUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        'scheduled',
        'checked-in',
        'checked-out',
        'expired',
        'cancelled'
      ),
      allowNull: false,
      defaultValue: 'scheduled',
    },
  },
  {
    tableName: 'guest_visits',
    timestamps: true,
  }
);

module.exports = GuestVisit;