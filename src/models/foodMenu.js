const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FoodMenu = sequelize.define('FoodMenu', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
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