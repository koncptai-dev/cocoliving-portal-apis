// src/models/paymentTransaction.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentTransaction = sequelize.define(
  'PaymentTransaction',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    bookingId: {
      type: DataTypes.BIGINT,
      allowNull: true, // booking created only after payment success in pay_then_book
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    merchantOrderId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    phonepeOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'Amount in paise (integer)',
    },
    type: {
      type: DataTypes.ENUM('PREBOOK', 'FULL', 'REMAINING'),
      allowNull: false,
    },
    // Status now includes EXPIRED for server-expired pending txs
    status: {
      type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    rawResponse: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    pendingBookingData: {
      type: DataTypes.JSON,
      allowNull: true, // store metadata required to create booking after success
    },
    webhookProcessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // redirectUrl may be long, keep as TEXT
    redirectUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'payment_transactions',
    timestamps: true,
  }
);

module.exports = PaymentTransaction;
