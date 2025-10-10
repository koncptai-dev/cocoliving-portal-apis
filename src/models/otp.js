// models/Otp.js
const sequelize = require("../config/database");

const { DataTypes } = require('sequelize'); 

const OTP = sequelize.define('OTP', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true, 
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    otp: { 
        type: DataTypes.STRING,
        allowNull: false,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    }
}, {
    
    timestamps: true, 
    tableName: 'otps' 
});

module.exports = OTP;