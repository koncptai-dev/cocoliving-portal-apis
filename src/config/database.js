const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const { Sequelize } = require('sequelize');

// Create a new Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME, 
  process.env.DB_USER, 
  process.env.DB_PASSWORD || null, 
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,  
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: false,
  }
);

// Authenticate database connection
sequelize.authenticate()
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ Database connection error:', err));

module.exports = sequelize; // ✅ Export Sequelize instance correctly
