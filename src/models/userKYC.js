const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");

const UserKYC = sequelize.define(
  "UserKYC",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },

    role: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // PAN fields
    panNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    panStatus: {
      type: DataTypes.STRING,

    },
    verifiedAtPan: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    panKycResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    panNameMatchScore: { type: DataTypes.INTEGER, allowNull: true },
    panNameMatchResponse: { type: DataTypes.TEXT, allowNull: true },
    panNameMatched: { type: DataTypes.BOOLEAN, allowNull: true, },

    // Aadhaar fields
    aadhaarLast4: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ekycStatus: {
      type: DataTypes.STRING,
    },
    verifiedAtAadhaar: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    adharKycResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    adharNameMatchScore: { type: DataTypes.INTEGER, allowNull: true },
    adharNameMatchResponse: { type: DataTypes.TEXT, allowNull: true },
    adharNameMatched: { type: DataTypes.BOOLEAN, allowNull: true, },

  },
  {
    tableName: "userKYC",
    timestamps: true,
  }
);

module.exports = UserKYC;
