const {DataTypes}=require('sequelize');
const sequelize=require('../config/database');

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
        allowNull:false
    },
    priority:{
        type:DataTypes.STRING,
        defaultValue:'medium'
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