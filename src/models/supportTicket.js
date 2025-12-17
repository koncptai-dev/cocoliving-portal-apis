const {DataTypes}=require('sequelize');
const sequelize=require('../config/database');
const Rooms=require('./rooms');
const Inventory = require("./inventory");
const Property = require('./property');

//create ticket model
const SupportTicket = sequelize.define('SupportTicket', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    supportCode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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
    roomNumber: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    issue: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    priority: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'low'
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'open'
    },
    assignedTo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    },
    image: {
        type: DataTypes.ARRAY(DataTypes.STRING),  //  To store image path or URL
        allowNull: true
    },
    videos: {
        type: DataTypes.ARRAY(DataTypes.STRING), // To store video paths or URLs
        allowNull: true
    },
    resolutionNotes:{
        type: DataTypes.TEXT,
        allowNull: true,
    },
    inventoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
        model: 'inventories',
        key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
    },
    inventoryName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Property, // your properties table
            key: 'id'
        }
    }
},
    {
        tableName: 'support_tickets'
    })

module.exports = SupportTicket;