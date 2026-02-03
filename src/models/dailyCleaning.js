const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DailyCleaning = sequelize.define('DailyCleaning', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    roomId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'rooms',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },

    cleanerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },

    cleaningDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },

    status: {
        type: DataTypes.ENUM('Pending', 'Completed'),
        defaultValue: 'Pending',
    },

     photos: {
        type: DataTypes.ARRAY(DataTypes.STRING), 
        allowNull: true,
        defaultValue: []
    },

    submittedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },

}, {
    tableName: 'daily_cleaning',
    timestamps: true,
});

module.exports = DailyCleaning;
