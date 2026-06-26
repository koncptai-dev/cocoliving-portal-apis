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
    merchantRefundId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    refundReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    originalMerchantOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
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
      type: DataTypes.ENUM('PREBOOK', 'FULL', 'REMAINING','SECURITY_DEPOSIT','MONTHLY_RENT', 'REFUND', 'EXTENSION', 'BOOK_DEPOSIT','OFFLINE', 'ELECTRICITY_RECHARGE'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    paymentMode: {
      type: DataTypes.ENUM('ONLINE', 'OFFLINE'),
      allowNull: false,
      defaultValue: 'ONLINE',
    },

    paymentDate: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    offlinePaymentType: {
      type: DataTypes.ENUM('CASH', 'CHEQUE', 'UPI'),
      allowNull: true,
    },

    adminNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    paymentImage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    invoicePdfPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    discountAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    createdByAdminId: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: 'payment_transactions',
    timestamps: true,
  }
);

module.exports = PaymentTransaction;
