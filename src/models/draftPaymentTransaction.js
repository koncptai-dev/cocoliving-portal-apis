const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DraftPaymentTransaction = sequelize.define(
  "DraftPaymentTransaction",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    draftBookingId: {
      type: DataTypes.BIGINT,
      allowNull: false,
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
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "Amount in paise (integer)",
    },
    type: {
      type: DataTypes.ENUM("OFFLINE"),
      allowNull: false,
      defaultValue: "OFFLINE",
    },
    status: {
      type: DataTypes.ENUM("PENDING", "SUCCESS", "FAILED", "EXPIRED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    paymentMode: {
      type: DataTypes.ENUM("ONLINE", "OFFLINE"),
      allowNull: false,
      defaultValue: "OFFLINE",
    },
    paymentDate: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    offlinePaymentType: {
      type: DataTypes.ENUM("CASH", "CHEQUE", "UPI"),
      allowNull: true,
    },
    paymentImage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    acknowledgementPdfPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    totalAmountReceived: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rentAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    waiveCurrentMonthRent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    waiveCurrentMonthRentApproval: { // remove
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    securityDepositType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    securityDepositAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    advanceRentAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    advanceRentDurationMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    mealSubscriptionAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    mealSubscriptionDurationMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    amcChargesAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    panCardNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdByAdminId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rawResponse: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    confirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    }
  },
  {
    tableName: "draft_payment_transactions",
    timestamps: true,
  }
);

module.exports = DraftPaymentTransaction;
