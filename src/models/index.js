const sequelize=require("../config/database");
const User=require('./user');
const Booking=require('./bookRoom')
const Rooms=require('./rooms')
const Event = require("./events");
const EventParticipation = require("./eventParticipation");
const Property=require('./property');
const Announcement = require('./annoucement');
const UserPermission=require('./userPermissoin');
const ServiceHistory = require("./serviceHistory");
const Inventory = require("./inventory");
const SupportTicket=require('./supportTicket');
const PropertyRateCard=require('./propertyRateCard');
const FoodMenu = require('./foodMenu');

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

// Booking → PropertyRateCard
Booking.belongsTo(PropertyRateCard, {
  foreignKey: "rateCardId",
  as: "rateCard",
});

PropertyRateCard.hasMany(Booking, {
  foreignKey: "rateCardId",
  as: "bookings",
});

//property to food menu
Property.hasMany(FoodMenu, { foreignKey: 'propertyId', as: 'foodMenus', });
FoodMenu.belongsTo(Property, { foreignKey: 'propertyId', as:'property' });
Booking.belongsTo(PropertyRateCard, { foreignKey: "rateCardId", as: "rateCard" });
Inventory.belongsTo(Property, { foreignKey: "propertyId", as: "property" });
Inventory.belongsTo(Rooms, { foreignKey: "roomId", as: "room" });
Inventory.hasMany(ServiceHistory, { foreignKey: "inventoryId", as: "serviceHistory", });
ServiceHistory.belongsTo(Inventory, { foreignKey: "inventoryId", as: "inventory", });
ServiceHistory.belongsTo(SupportTicket, { foreignKey: "ticketId", as: "ticket", });
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
    PropertyRateCard,
    FoodMenu,
    Inventory,
    ServiceHistory,
}
