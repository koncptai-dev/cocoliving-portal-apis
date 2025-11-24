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
            model: 'Properties', 
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    
    menu: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    }
    
}, {
    tableName: 'food_menus',
    timestamps: true 
}
);

module.exports = FoodMenu;