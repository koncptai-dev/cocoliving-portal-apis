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

    // PAN fields
    panNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    panStatus: {
      type: DataTypes.ENUM("pending", "verified", "failed"),
      defaultValue: "pending",
    },
    verifiedAtPan: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    panKycResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Aadhaar fields
    aadhaarLast4: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ekycStatus: {
      type: DataTypes.ENUM("verified", "not_verified"),
    },
    verifiedAtAadhaar: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    adharKycResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

  },
  {
    tableName: "userKYC",
    timestamps: true,
  }
);

module.exports = UserKYC;
