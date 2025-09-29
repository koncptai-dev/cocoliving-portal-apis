const {DataTypes}=require('sequelize');
const sequelize=require('../config/database');
const Rooms=require('./rooms');

//create ticket model
const SupportTicket=sequelize.define('SupportTicket',{
    id:{
        type:DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
     userId: { 
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users', 
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Rooms,
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    roomNumber:{
        type:DataTypes.INTEGER,
        allowNull:false
    },
    date:{
        type:DataTypes.DATEONLY,
        allowNull:false
    },
    issue:{
        type:DataTypes.TEXT,
        allowNull:false
    },
    description:{
        type:DataTypes.TEXT,
        allowNull:true
    },
    priority:{
        type:DataTypes.STRING,
        allowNull:true,
        defaultValue:'low'
    },
    status:{
        type:DataTypes.STRING,
        defaultValue:'open'
    },
    assignedTo:{
        type:DataTypes.TEXT,
        allowNull:true
    }
},
{
    tableName:'support_tickets'
})

module.exports=SupportTicket;