const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceTeamDetails = sequelize.define('ServiceTeamDetails', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',   // table name
            key: 'id'
        },
        onUpdate: "CASCADE",
        onDelete: 'CASCADE'
    },

    serviceRoleType: {
        type: DataTypes.STRING,
        allowNull: false
    }

}, {
    tableName: 'service_team_details'
});

module.exports = ServiceTeamDetails;
