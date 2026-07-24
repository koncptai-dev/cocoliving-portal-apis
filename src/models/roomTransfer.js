const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RoomTransfer = sequelize.define('RoomTransfer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  fromRoomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  toRoomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  transferDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  fines: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  totalFine: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: 0,
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  tableName: 'room_transfers'
});

module.exports = RoomTransfer;
