const sequelize = require("../config/database");

const SupportTicket=require('./supportTicket');
const User=require('./user');
const Booking=require('./bookRoom')
const Rooms=require('./rooms')
const Event = require("./events");
const EventParticipation = require("./eventParticipation");
const Property=require('./property');
const Announcement = require('./annoucement');
const UserPermission=require('./userPermissoin');
const PropertyRateCard=require('./propertyRateCard');

User.hasMany(SupportTicket, {foreignKey: "userId", as: "tickets" });
SupportTicket.belongsTo(User, {foreignKey: "userId", as: "user" });

// Associations
Rooms.hasMany(Booking, { foreignKey: "roomId", as:"bookings" });
Booking.belongsTo(Rooms, { foreignKey: "roomId", as:"room" });

User.hasMany(Booking, { foreignKey: "userId",as:"bookings" });
Booking.belongsTo(User, { foreignKey: "userId" ,as:"user"});

Event.hasMany(EventParticipation, { foreignKey: "eventId" });
EventParticipation.belongsTo(Event, { foreignKey: "eventId" });

User.hasMany(EventParticipation, { foreignKey: "userId" });
EventParticipation.belongsTo(User, { foreignKey: "userId" });

Property.hasMany(Rooms,{foreignKey:'propertyId',as:'rooms'});
Rooms.belongsTo(Property,{foreignKey:'propertyId',as:'property'});

// Property to Event
Property.hasMany(Event, { foreignKey: 'propertyId', as: 'events' });
Event.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });

Property.hasMany(Announcement, { foreignKey: 'propertyId', as: 'announcements' });
Announcement.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });

User.hasOne(UserPermission, { foreignKey: 'userId', as: 'permission' });
UserPermission.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Link SupportTicket to Room
Rooms.hasMany(SupportTicket, { foreignKey: 'roomId', as: 'tickets' });
SupportTicket.belongsTo(Rooms, { foreignKey: 'roomId', as: 'room' });

//propertyCard
PropertyRateCard.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
Property.hasMany(PropertyRateCard, { foreignKey: 'propertyId', as: 'rateCard' });

module.exports={
    sequelize,
    SupportTicket,
    User,
    Booking,
    Rooms,
    Event,
    EventParticipation,
    Property,
    Announcement,
    UserPermission,
    PropertyRateCard
}