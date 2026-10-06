const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

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

    billingMonth: {
      type: DataTypes.STRING(7),
      allowNull: false,
      comment: "Billing month in YYYY-MM format",
    },

    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Meal subscription amount in INR",
    },

    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "PAID",
        "PARTIALLY_REFUNDED",
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
      {
        unique: true,
        fields: ["bookingId", "billingMonth"],
      },
      {
        fields: ["bookingId"],
      },
      {
        fields: ["paymentTransactionId"],
      },
      {
        fields: ["billingMonth"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);

module.exports = MealSubscription;