const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rooms = sequelize.define('Rooms', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    propertyId:{
        type:DataTypes.INTEGER,
        allowNull:false,
        references:{
            model: 'Properties',
            key: 'id'
        },
        onDelete:'CASCADE'
    },
    roomNumber: {
        type: DataTypes.INTEGER,
        allowNull:false 
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
        type: DataTypes.INTEGER,
        allowNull: false,
    
    },
    depositAmount: { 
        type: DataTypes.INTEGER,
         allowNull: false
    },
    preferredUserType: { 
        type: DataTypes.STRING 
    },
     amenities: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
    }, // Comma-separated
    description: {
        type: DataTypes.TEXT,
        allowNull: true
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