const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceTeamProperty = sequelize.define('ServiceTeamProperty', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  serviceTeamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'service_team_details',
      key: 'id'
    },
    onUpdate: "CASCADE",
    onDelete: "CASCADE"
  },

  propertyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Properties',
      key: 'id'
    },
    onUpdate: "CASCADE",
    onDelete: "CASCADE"
  }

}, {
  tableName: 'service_team_properties'
});

module.exports = ServiceTeamProperty;
