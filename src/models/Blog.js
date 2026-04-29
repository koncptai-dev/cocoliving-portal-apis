const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');   // ← same as your other models

const Blog = sequelize.define('Blog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    url: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
    },
    thumbnail: {
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    altText: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
   content: {
   type: DataTypes.TEXT,
   allowNull: false,
},

metaTitle: {
  type: DataTypes.STRING(255),
  allowNull: true,
},
metaDescription: {
  type: DataTypes.TEXT,
  allowNull: true,
},
customCss: {
  type: DataTypes.TEXT,
  allowNull: true,
},
customJs: {
  type: DataTypes.TEXT,
  allowNull: true,
},
    // status: {
    //     type: DataTypes.ENUM('draft', 'published', 'live', 'inactive'),
    //     defaultValue: 'draft',
    // },
    status: {
  type: DataTypes.ENUM('draft', 'published', 'inactive'),
  defaultValue: 'draft',
},


}, {
    tableName: 'blogs',
    timestamps: true,
});

module.exports = Blog;   // ← IMPORTANT: direct export like your other models