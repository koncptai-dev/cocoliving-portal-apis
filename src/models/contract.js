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
  signedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: "contracts",
});

module.exports = Contract;