const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Property = require('./property');

const Coupon = sequelize.define('Coupon', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
        validate: {
            len: [1, 10]
        }
    },
    discountType: {
        type: DataTypes.ENUM('percentage', 'fixed'),
        allowNull: false
    },
    discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('Active', 'Inactive'),
        defaultValue: 'Active'
    },
    shareTarget: {
        type: DataTypes.ENUM('All Users', 'Specific Property', 'Not Shared'),
        defaultValue: 'Not Shared'
    },
    propertyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: Property, key: 'id' }
    },
    isDisabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'coupons',
    timestamps: true
});

module.exports = Coupon;
