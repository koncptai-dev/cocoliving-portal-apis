const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user");

const GatePass = sequelize.define(
  "GatePass",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    requestType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Date for which the gate pass is requested",
    },
    time: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: "Time at which the user will enter/exit",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },
    approvedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Email of the parent who approved or rejected the request",
    },
  },
  {
    tableName: "gate_passes",
  }
);

module.exports = GatePass;
