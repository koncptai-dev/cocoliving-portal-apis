const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Property = require('./property');

const ScheduledVisit = sequelize.define(
  'ScheduledVisit',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    visitDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM('pending', 'approved', 'denied'),
      allowNull: false,
      defaultValue: 'pending',
    },

  },
  {
    tableName: 'scheduled_visits',
    timestamps: true,
  }
);

module.exports = ScheduledVisit;