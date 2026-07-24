const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DepositDeduction = sequelize.define('DepositDeduction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  itemKey: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  }
}, {
  tableName: 'deposit_deductions'
});

module.exports = DepositDeduction;
