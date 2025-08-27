const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rooms = sequelize.define('Rooms', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    roomNumber: {
        type: DataTypes.INTEGER,
        unique: true
    },
    roomType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    floorNumber: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    monthlyRent: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    depositAmount: { 
        type: DataTypes.FLOAT,
         allowNull: false
    },
    preferredUserType: { 
        type: DataTypes.STRING 
    },
    amenities: { 
        type: DataTypes.STRING
     }, // Comma-separated
    description: { 
        type: DataTypes.TEXT ,
        allowNull:true
    },
    status: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        defaultValue: "available" 
    } 
},
{
    tableName: 'rooms'
})

module.exports = Rooms;