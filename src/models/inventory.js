const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Property = require("./property");
const Room = require("./rooms");

const Inventory = sequelize.define(
  "Inventory",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    inventoryCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    itemName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Property,
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true, 
      references: {
        model: Room,
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    isCommonAsset: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    unitCost: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    purchaseDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    condition: {
      type: DataTypes.ENUM("New", "In Use", "Under Maintenance", "Damaged" , "Good"),
      defaultValue: "New",
    },
    status: {
      type: DataTypes.ENUM("Available", "Allocated", "Under Repair", "Retired"),
      defaultValue: "Available",
    },
  },
  {
    tableName: "inventories",
    timestamps: true,
  }
);

module.exports = Inventory;
