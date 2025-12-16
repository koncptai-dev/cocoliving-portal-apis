const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    fullName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    registrationToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    userType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetCode: {
        type: DataTypes.INTEGER,
        allowNull: true
    },//for forgot password
    phone: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    isPhoneVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    address: {
        type: DataTypes.STRING,
        allowNull: true
    },

    profileImage: {
        type: DataTypes.STRING, // store file path or filename
        allowNull: true
    },
    status: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    role: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2
    },
    roleName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    dateOfBirth: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    isEmailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    parentName: { type: DataTypes.STRING, allowNull: true },
    parentMobile: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { is: /^\d{10}$/ }
    },
    parentEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    // kycDocuments: { type: DataTypes.JSON, allowNull: true }, // store multiple files
    foodPreference: { type: DataTypes.ENUM('Jain', 'Non-Jain'), allowNull: true },
    allergies: { type: DataTypes.TEXT, allowNull: true },
    collegeName: { type: DataTypes.STRING, allowNull: true },
    course: { type: DataTypes.STRING, allowNull: true },
    // medicalRecords: { type: DataTypes.JSON, allowNull: true } // store multiple files/details

    companyName: { type: DataTypes.STRING, allowNull: true },
    position: { type: DataTypes.STRING, allowNull: true },

    fcmToken:{type:DataTypes.STRING,allowNull:true}
}, {
    tableName: 'users'
})

module.exports = User;