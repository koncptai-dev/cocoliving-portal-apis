const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Booking = require("./bookRoom");

const Contract = sequelize.define("Contract", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Booking, key: "id" },
    onDelete: "CASCADE",
  },
  signedPdfPath: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tenantSignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  adminSignature: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  esignReferenceDocId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  esignDocketId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  esignDocumentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  esignStatus: {
    type: DataTypes.ENUM("NOT_INITIATED", "IN_PROGRESS", "COMPLETED", "FAILED"),
    allowNull: false,
    defaultValue: "NOT_INITIATED",
  },
  esignRawResponse: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  residentSignedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },

  adminSignedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  signedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "contracts",
});

module.exports = Contract;
