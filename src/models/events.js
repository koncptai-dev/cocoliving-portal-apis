const {DataTypes}=require('sequelize');
const sequelize=require('../config/database');

const Events=sequelize.define('Events',{
    id:{
        type:DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    title:{
        type:DataTypes.TEXT,
        allowNull:false
    },
    eventDate:{
        type:DataTypes.DATEONLY,
        allowNull:false
    },
    Location:{
        type:DataTypes.TEXT,
        allowNull:false
    },
    maxParticipants:{
        type:DataTypes.INTEGER,
        allowNull:false
    },
    description:{
        type:DataTypes.TEXT,
        allowNull:true
    }
},{
    tableName:'events'
}
)

module.exports=Events