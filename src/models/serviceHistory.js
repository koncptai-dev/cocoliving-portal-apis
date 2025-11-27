// src/models/ServiceHistory.js
const { DataTypes } = require("sequelize");
const SupportTicket = require("./supportTicket");
const sequelize = require("../config/database");
const Inventory = require("./inventory");

const ServiceHistory = sequelize.define(
  "ServiceHistory",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    inventoryId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "inventories", key: "id" }, onDelete: "CASCADE",},
    ticketId: { type: DataTypes.INTEGER, allowNull: true, }, 
    supportCode: { type: DataTypes.STRING, allowNull: true, },
    inventoryName: { type: DataTypes.STRING, allowNull: true, },

    issueDescription: { type: DataTypes.TEXT, allowNull: false },
    assignedTo: { type: DataTypes.STRING, allowNull: true },
    serviceDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, },
    resolutionNotes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM("Open", "In Progress", "Resolved"), defaultValue: "Open",
    },
  },
  {
    tableName: "service_history",
    timestamps: true,
  }
);


module.exports = ServiceHistory;