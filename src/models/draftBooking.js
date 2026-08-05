const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DraftBooking = sequelize.define(
  "DraftBooking",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    createdByRole: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdByAdminId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rateCardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookingSource: {
      type: DataTypes.ENUM("ONLINE", "OFFLINE"),
      allowNull: false,
      defaultValue: "OFFLINE",
    },
    roomType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    baseMonthlyRent: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    isRentIncludingMeals: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    mealPlan: {
      type: DataTypes.ENUM("NONE", "2_TIMES", "4_TIMES"),
      allowNull: false,
      defaultValue: "NONE",
    },
    mealAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalMonthlyAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("draft_booking", "draft_payment", "draft_submitted", "draft_confirmed", "draft_rejected", "draft_cancelled"),
      allowNull: false,
      defaultValue: "draft_booking",
    },
    totalAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    remainingAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bookingType: {
      type: DataTypes.ENUM("PREBOOK", "BOOK"),
      allowNull: false,
      defaultValue: "BOOK",
    },
    paymentStatus: {
      type: DataTypes.ENUM("INITIATED", "PARTIAL", "COMPLETED"),
      allowNull: false,
      defaultValue: "INITIATED",
    },
    onboardingStatus: {
      type: DataTypes.ENUM("NOT_INITIATED", "INITIATED", "OTP_PENDING", "COMPLETED"),
      allowNull: false,
      defaultValue: "NOT_INITIATED",
    },
    contractStatus: {
      type: DataTypes.ENUM("NOT_SIGNED", "SIGNED"),
      allowNull: false,
      defaultValue: "NOT_SIGNED",
    },
    adminContractStatus: {
      type: DataTypes.ENUM("NOT_SIGNED", "SIGNED"),
      allowNull: false,
      defaultValue: "NOT_SIGNED",
    },
    cancelRequestStatus: {
      type: DataTypes.ENUM("NONE", "PENDING", "APPROVED", "REJECTED"),
      allowNull: false,
      defaultValue: "NONE",
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
    securityDepositPaid: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    monthlyPlanSelected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    monthlyInstallment: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    installmentsPaid: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    firstElectricityRechargeDone: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    alisteUserId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    removedUserFromAliste: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    paymentReviewTotalAmountReceived: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewRentAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewWaiveCurrentMonthRent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    paymentReviewWaiveCurrentMonthRentApproval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    paymentReviewSecurityDepositType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentReviewSecurityDepositAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewAdvanceRentAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewAdvanceRentDurationMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewMealSubscriptionAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewMealSubscriptionDurationMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewAmcChargesAmount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentReviewPanCardNumber: {
      type: DataTypes.STRING,
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
    tableName: "draft_bookings",
  }
);

module.exports = DraftBooking;
