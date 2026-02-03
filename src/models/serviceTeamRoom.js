const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceTeamRoom = sequelize.define('ServiceTeamRoom', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    serviceTeamId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'service_team_details',
            key: 'id'
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
    },

    roomId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'rooms',
            key: 'id'
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
    },
    effectiveFromDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    effectiveToDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Properties', key: 'id' }
    },

    floorNumber: {
        type: DataTypes.INTEGER,
        allowNull: true
    }

}, {
    tableName: 'service_team_rooms'
});

module.exports = ServiceTeamRoom;
