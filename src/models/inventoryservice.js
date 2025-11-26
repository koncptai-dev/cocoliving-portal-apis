const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Inventory = require("./inventory");
const SupportTicket = require("./supportTicket");

const InventoryService = sequelize.define(
  "InventoryService",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    inventoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Inventory, key: "id" },
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: SupportTicket, key: "id" },
    },
    serviceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    assignedTo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("Open", "In Progress", "Resolved"),
      defaultValue: "Open",
    },
  },
  {
    tableName: "inventory_services",
    timestamps: true,
  }
);

module.exports = InventoryService;
