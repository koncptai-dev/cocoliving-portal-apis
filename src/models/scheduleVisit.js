const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScheduleVisit = sequelize.define("ScheduleVisit",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
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
            type: DataTypes.DATEONLY, // yyyy-mm-dd
            allowNull: false,
        },
        visitTime: {
            type: DataTypes.STRING, // "10:30 AM"
            allowNull: false,
        },
       
    },
    {
        tableName: "schedule_visits",
        timestamps: true,
    });

module.exports = ScheduleVisit;
