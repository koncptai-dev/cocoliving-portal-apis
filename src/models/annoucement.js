const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Property = require('./property');

const Announcement = sequelize.define("Announcement", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  priority: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Normal",
  },
  audience: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
  },
  created:{
    type: DataTypes.DATEONLY,
    allowNull:true
  },propertyId: { 
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: Property, key: 'id' }
    },
     is_active: { 
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: "announcements",
  timestamps: true, 
});

module.exports = Announcement;
