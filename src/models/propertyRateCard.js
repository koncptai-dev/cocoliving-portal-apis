const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Property = require('./property');

const PropertyRateCard = sequelize.define('PropertyRateCard', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  propertyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Property,
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  roomType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  roomAmenities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  roomImages: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true
  },
  rent: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
}, {
  tableName: 'property_ratecard',
  timestamps: true,
});


module.exports = PropertyRateCard;
