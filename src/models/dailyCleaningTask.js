const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DailyCleaningTask = sequelize.define('DailyCleaningTask', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    dailyCleaningId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'daily_cleaning',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },

    taskName: {
        type: DataTypes.STRING,
        allowNull: false,  // "Bed cleaning", "Clean AC filter"
    },

    isCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },


}, {
    tableName: 'daily_cleaning_tasks',
    timestamps: true,
});

module.exports = DailyCleaningTask;
