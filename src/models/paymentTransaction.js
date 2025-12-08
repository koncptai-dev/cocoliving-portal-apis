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
      allowNull: true,
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
      type: DataTypes.ENUM('PREBOOK', 'FULL', 'REMAINING','REFUND'),
      allowNull: false,
    },
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
      allowNull: true, 
    },
    webhookProcessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
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
