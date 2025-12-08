// models/Otp.js
const sequelize = require("../config/database");

const { DataTypes } = require('sequelize');

const OTP = sequelize.define('OTP', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    //for email or phone
    identifier: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('email', 'phone'),
        allowNull: false,
    },
    otp: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    
}, {

    timestamps: true,
    tableName: 'otps'
});

module.exports = OTP;