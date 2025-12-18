const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const SupportTicket = require("./supportTicket");

const TicketLog = sequelize.define(
  "TicketLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: SupportTicket,
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    oldValue: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    performedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    performedByName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    performedByRole: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "ticket_logs",
    timestamps: true,
    createdAt: true,
    updatedAt: false,
  }
);

module.exports = TicketLog;