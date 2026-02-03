const sequelize = require("../config/database");

const SupportTicket = require("./supportTicket");
const User = require("./user");
const Booking = require("./bookRoom");
const BookingOnboarding = require('./bookingOnboarding');
const BookingExtension = require("./bookingExtension");
const Rooms = require("./rooms");
const Event = require("./events");
const EventParticipation = require("./eventParticipation");
const Property = require("./property");
const Announcement = require("./annoucement");
const UserPermission = require("./userPermissoin");
const PropertyRateCard = require("./propertyRateCard");
const FoodMenu = require("./foodMenu");
const Inventory = require("./inventory");
const ServiceHistory = require("./serviceHistory");
const PaymentTransaction = require("./paymentTransaction");
const TicketLog = require("./ticketLog");
const GatePass = require("./gatePass");
const UserNotificationSetting = require("./userNotificationSetting");
const ServiceTeam = require("./serviceTeam");
const ServiceTeamProperty = require("./serviceTeamProperty");
const ServiceTeamRoom = require("./serviceTeamRoom");
const DailyCleaning = require("./dailyCleaning");
const DailyCleaningTask = require("./dailyCleaningTask");

User.hasMany(SupportTicket, { foreignKey: "userId", as: "tickets" });
SupportTicket.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associations
Rooms.hasMany(Booking, { foreignKey: "roomId", as: "bookings" });
Booking.belongsTo(Rooms, { foreignKey: "roomId", as: "room" });

User.hasMany(Booking, { foreignKey: "userId", as: "bookings" });
Booking.belongsTo(User, { foreignKey: "userId", as: "user" });

Event.hasMany(EventParticipation, { foreignKey: "eventId" });
EventParticipation.belongsTo(Event, { foreignKey: "eventId" });

User.hasMany(EventParticipation, { foreignKey: "userId" });
EventParticipation.belongsTo(User, { foreignKey: "userId" });

Property.hasMany(Rooms, { foreignKey: "propertyId", as: "rooms" });
Rooms.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

// Property to Event
Property.hasMany(Event, { foreignKey: "propertyId", as: "events" });
Event.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

Property.hasMany(Announcement, {
  foreignKey: "propertyId",
  as: "announcements",
});
Announcement.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

User.hasOne(UserPermission, { foreignKey: "userId", as: "permission" });
UserPermission.belongsTo(User, { foreignKey: "userId", as: "user" });

// Link SupportTicket to Room
Rooms.hasMany(SupportTicket, { foreignKey: "roomId", as: "tickets" });
SupportTicket.belongsTo(Rooms, { foreignKey: "roomId", as: "room" });

//propertyCard
PropertyRateCard.belongsTo(Property, { foreignKey: "propertyId", as: "property", });
Property.hasMany(PropertyRateCard, { foreignKey: "propertyId", as: "rateCard", });

//property to food menu
Property.hasMany(FoodMenu, { foreignKey: "propertyId", as: "foodMenus" });
FoodMenu.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

PropertyRateCard.hasMany(Booking, { foreignKey: "rateCardId", as: "bookings" });
Booking.belongsTo(PropertyRateCard, { foreignKey: "rateCardId", as: "rateCard", });

// Inventory and Service History
Inventory.belongsTo(Property, { foreignKey: "propertyId", as: "property" });
Property.hasMany(Inventory, { foreignKey: "propertyId", as: "inventories" }); // ← ADDED

Inventory.belongsTo(Rooms, { foreignKey: "roomId", as: "room" });
Rooms.hasMany(Inventory, { foreignKey: "roomId", as: "roomInventories" }); // ← ADDED

Inventory.hasMany(ServiceHistory, {
  foreignKey: "inventoryId",
  as: "serviceHistory",
});
ServiceHistory.belongsTo(Inventory, {
  foreignKey: "inventoryId",
  as: "inventory",
});
ServiceHistory.belongsTo(SupportTicket, {
  foreignKey: "ticketId",
  as: "ticket",
});

// ServiceHistory → Assigned Admin
User.hasMany(ServiceHistory, {
  foreignKey: "assignedTo",
  as: "assignedServiceHistory",
});
ServiceHistory.belongsTo(User, {
  foreignKey: "assignedTo",
  as: "assignedAdmin",
});

// Payment ↔ Booking
Booking.hasMany(PaymentTransaction, {
  foreignKey: "bookingId",
  as: "transactions",
});
PaymentTransaction.belongsTo(Booking, {
  foreignKey: "bookingId",
  as: "booking",
});

// Payment ↔ User
User.hasMany(PaymentTransaction, { foreignKey: "userId", as: "transactions" });
PaymentTransaction.belongsTo(User, { foreignKey: "userId", as: "user" });

SupportTicket.hasMany(TicketLog, { foreignKey: "ticketId", as: "logs" });
TicketLog.belongsTo(SupportTicket, { foreignKey: "ticketId", as: "ticket" });

User.hasMany(TicketLog, { foreignKey: "performedBy", as: "performedLogs" });
TicketLog.belongsTo(User, { foreignKey: "performedBy", as: "actor" });

// Gate Pass associations
User.hasMany(GatePass, { foreignKey: "userId", as: "gatePasses" });
GatePass.belongsTo(User, { foreignKey: "userId", as: "user" });

// Booking ↔ Onboarding
Booking.hasOne(BookingOnboarding, { foreignKey: 'bookingId', as: 'onboarding' });
BookingOnboarding.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

// Admin who started onboarding
User.hasMany(BookingOnboarding, { foreignKey: 'startedBy', as: 'startedOnboardings' });
BookingOnboarding.belongsTo(User, { foreignKey: 'startedBy', as: 'admin' });

User.hasOne(UserNotificationSetting, {
  foreignKey: "userId",
  as: "notificationSettings",
  onDelete: "CASCADE",
});

UserNotificationSetting.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});
// Bookings <-> Booking Extension
Booking.hasMany(BookingExtension, { foreignKey: 'bookingId', as: 'extensions' });
BookingExtension.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

// User <-> Booking Extension
User.hasMany(BookingExtension, { foreignKey: 'userId', as: 'bookingExtensions' });
BookingExtension.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// PaymentTransaction <-> Booking Extension
PaymentTransaction.hasOne(BookingExtension, { foreignKey: 'paymentTransactionId', as: 'extension' });
BookingExtension.belongsTo(PaymentTransaction, { foreignKey: 'paymentTransactionId', as: 'paymentTransaction' });

// User <-> Service Team
User.hasMany(ServiceTeam, { foreignKey: "userId", as: "serviceAssignments" });
ServiceTeam.belongsTo(User, { foreignKey: "userId", as: "user" });

// Property <-> Service Team
ServiceTeam.hasMany(ServiceTeamProperty, { foreignKey: "serviceTeamId", as: "assignedProperties" });
ServiceTeamProperty.belongsTo(ServiceTeam, { foreignKey: "serviceTeamId", as: "serviceTeam" });

Property.hasMany(ServiceTeamProperty, { foreignKey: "propertyId", as: "serviceTeamAssignments" });
ServiceTeamProperty.belongsTo(Property, { foreignKey: "propertyId", as: "teamproperty" });

ServiceTeam.hasMany(ServiceTeamRoom, { foreignKey: "serviceTeamId", as: "assignedRooms" });
ServiceTeamRoom.belongsTo(ServiceTeam, { foreignKey: "serviceTeamId", as: "serviceTeam" });

Property.hasMany(ServiceTeamRoom, { foreignKey: "propertyId", as: "serviceTeamRooms" });
ServiceTeamRoom.belongsTo(Property, { foreignKey: "propertyId", as: "roomproperty" });

Rooms.hasMany(ServiceTeamRoom, { foreignKey: "roomId", as: "serviceTeamRoomAssignments" });
ServiceTeamRoom.belongsTo(Rooms, { foreignKey: "roomId", as: "teamroom" });

// DailyCleaning → Tasks
DailyCleaning.hasMany(DailyCleaningTask, { foreignKey: "dailyCleaningId", as: "tasks" });
DailyCleaningTask.belongsTo(DailyCleaning, {foreignKey: "dailyCleaningId",as: "dailyCleaning"});

//  DailyCleaning → Room
Rooms.hasMany(DailyCleaning, { foreignKey: "roomId", as: "dailyCleanings" });
DailyCleaning.belongsTo(Rooms, { foreignKey: "roomId", as: "room" });

// DailyCleaning → Cleaner(User)
User.hasMany(DailyCleaning, { foreignKey: "cleanerId", as: "dailyCleanings" });
DailyCleaning.belongsTo(User, { foreignKey: "cleanerId", as: "cleaner" });

module.exports = {
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
  PaymentTransaction,
  TicketLog,
  GatePass,
  BookingOnboarding,
  BookingExtension,
  UserNotificationSetting,
  ServiceTeam,
  ServiceTeamProperty,
  ServiceTeamRoom,
  DailyCleaning,
  DailyCleaningTask,
}
