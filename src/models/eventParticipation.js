const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");



const EventParticipation = sequelize.define("EventParticipation", {
   eventId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "not_attend"
  },
}, {
  tableName: "event_participations"
});



module.exports = EventParticipation;
