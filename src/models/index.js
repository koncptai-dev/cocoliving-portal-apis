const sequelize = require("../config/database");

const SupportTicket=require('./supportTicket');
const User=require('./user');
const Booking=require('./bookRoom')
const Rooms=require('./rooms')
const Event = require("./events");
const EventParticipation = require("./eventParticipation");
const Property=require('./property');

User.hasMany(SupportTicket, {foreignKey: "userId", as: "tickets" });
SupportTicket.belongsTo(User, {foreignKey: "userId", as: "user" });

// Associations
Rooms.hasMany(Booking, { foreignKey: "roomId", as:"bookings" });
Booking.belongsTo(Rooms, { foreignKey: "roomId", as:"room" });

User.hasMany(Booking, { foreignKey: "userId" });
Booking.belongsTo(User, { foreignKey: "userId" });

Event.hasMany(EventParticipation, { foreignKey: "eventId" });
EventParticipation.belongsTo(Event, { foreignKey: "eventId" });

User.hasMany(EventParticipation, { foreignKey: "userId" });
EventParticipation.belongsTo(User, { foreignKey: "userId" });

Property.hasMany(Rooms,{foreignKey:'propertyId',as:'rooms'});
Rooms.belongsTo(Property,{foreignKey:'propertyId',as:'property'});

module.exports={
    sequelize,
    SupportTicket,
    User,
    Booking,
    Rooms,
    Event,
    EventParticipation,
    Property
}