const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Page = sequelize.define('Page', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  page_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
     defaultValue: DataTypes.NOW 
  }
}, {
  tableName: 'pages',
  timestamps: true
});

module.exports = Page;