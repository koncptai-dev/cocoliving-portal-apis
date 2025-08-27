const {DataTypes}=require('sequelize');
const sequelize = require('../config/database');

const User=sequelize.define('User',{
    id:{
        type:DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    fullName:{
        type:DataTypes.STRING,
        allowNull:false
    },
    email:{
        type:DataTypes.STRING,
        allowNull:false,
        unique:true,
        validate:{
            isEmail:true
        }
    },
    userType:{
        type:DataTypes.STRING,
        allowNull:false
    },
    password:{
        type:DataTypes.STRING,
        allowNull:true
    },
    resetCode:{
        type:DataTypes.INTEGER,
        allowNull:true
    },//for forgot password
    phone:{
        type:DataTypes.STRING,
        allowNull:true,
        validate:{
            is:/^\d{10}$/ // Validates a 10-digit phone number
        }
    },
    address:{
        type:DataTypes.STRING,
        allowNull:true
    },
    bio:{
        type:DataTypes.TEXT,    
        allowNull:true
    },
    emergencyContact:{
         type:DataTypes.STRING,
        allowNull:true,
        validate:{
            is:/^\d{10}$/ // Validates a 10-digit phone number
        }
    },
    emergencyContactName:{
        type:DataTypes.STRING,
        allowNull:true
    },
    livingPreferences:{
        type:DataTypes.TEXT,
        allowNull:true
    },
    profileImage: {
    type: DataTypes.STRING, // store file path or filename
    allowNull: true
    },
    status:{
        type:DataTypes.INTEGER,
        defaultValue:1,
        allowNull:false
    },
    role:{
        type:DataTypes.INTEGER,
        allowNull:false,
        defaultValue:2
    },
    occupation:{
        type:DataTypes.STRING,
        allowNull:true
    },
    dateOfBirth:{
        type:DataTypes.DATEONLY,
        allowNull:true
    }
},
{
    tableName:'users'
})

module.exports=User;