const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FoodMenu = sequelize.define('FoodMenu', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Properties', // must match your Properties table name
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    breakfast_items: {
        type: DataTypes.JSON,
        allowNull: true
    },
    lunch_items:{
        type: DataTypes.JSON,
        allowNull: true
    },
    dinner_items:{
        type: DataTypes.JSON,
        allowNull: true
    }
    
}, {
    tableName: 'food_menus',
    timestamps: true 
}
);

module.exports = FoodMenu;