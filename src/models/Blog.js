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
    content: {
  type: DataTypes.TEXT,
  allowNull: false,
},
    status: {
        type: DataTypes.ENUM('draft', 'published', 'live', 'inactive'),
        defaultValue: 'draft',
    },
}, {
    tableName: 'blogs',
    timestamps: true,
});

module.exports = Blog;   // ← IMPORTANT: direct export like your other models