const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PropertyFloorLayout = sequelize.define(
  "PropertyFloorLayout",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Properties", 
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    floorNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    floorImages: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "PropertyFloorLayouts",
    timestamps: true,
  }
);

module.exports = PropertyFloorLayout;