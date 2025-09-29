const {DataTypes}=require('sequelize');
const sequelize=require('../config/database');
const Property = require('./property');

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
    eventTime:{
        type:DataTypes.TIME,
        allowNull:true,
    },
    location:{
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
    },
    propertyId: { 
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: Property, key: 'id' }
    },
     is_active: { 
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
},{
    tableName:'events'
}
)

module.exports=Events