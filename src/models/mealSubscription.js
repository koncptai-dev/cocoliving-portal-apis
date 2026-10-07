const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const MealSubscription = sequelize.define(
  "MealSubscription",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },

    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    paymentTransactionId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },

    mealPlan: {
      type: DataTypes.ENUM("2_TIMES", "4_TIMES"),
      allowNull: false,
    },

    monthlyRate: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    billingMonths: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    startMonth: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },

    endMonth: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },

    monthsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    waivedFirstMonth: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "PAID",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
        "FAILED",
        "CANCELLED"
      ),
      allowNull: false,
      defaultValue: "PENDING",
    },

    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    refundedAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Total refunded amount in INR",
    },
  },
  {
    tableName: "meal_subscriptions",
    timestamps: true,

    indexes: [
      { unique: true, fields: ["paymentTransactionId"] },
      { fields: ["bookingId", "startMonth"] },
      { fields: ["bookingId"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = MealSubscription;