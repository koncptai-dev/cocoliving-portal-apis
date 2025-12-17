const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sequelize = require("./config/database");
const app = express();
const admin = require("./routes/AdminRoutes");
const User = require("./routes/UserRoute");
const Rooms = require("./routes/RoomsRoutes");
const Tickets = require("./routes/SupportTicketRoutes");
const Events = require("./routes/EventRoutes");
const Common = require("./routes/CommonRoutes");
const UserByAdminRoutes = require("./routes/UserByAdminRoutes");
const BookRoomRoute = require("./routes/RoomBookRoute");
const AnnouncementRoute = require("./routes/AnnouncementRoute");
const PropertyRoute = require("./routes/PropertyRoute");
const AdminBooking = require("./routes/AdminBookingRoutes");
const UserAndBookingDetails = require("./routes/UserandBookingRoutes");
const PagesRoute = require("./routes/pagesRoute");
const InventoryRoutes = require("./routes/inventoryRoute");
const ServiceHistoryRoutes = require("./routes/serviceHistory");
const FoodMenuRoute = require("./routes/FoodMenuRoute");
const ActivityRoute = require("./routes/ActivityRoutes");
const BookingPaymentRoutes = require("./routes/BookingPaymentRoutes");
const PaymentRoutes = require("./routes/PaymentRoutes");
const path = require("path");
const panRoutes = require("./routes/panRoutes");
const digilocker = require("./routes/digilocker");
const UserKYCRoutes = require("./routes/UserKYCRoutes");
const AuditLogRoutes = require("./routes/AuditLog");
const FcmRoutes = require("./routes/FcmRoutes");
const DashboardRoutes = require("./routes/DashboardRoutes");
const UserDashboardRoutes = require("./routes/UserDashboardRoutes");

app.use(
  cors({
    origin: "*", // Allow only your frontend's IP
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true, // if you're using cookies/sessions
  })
);

// must be BEFORE json parser , will break flow if changed
app.post(
  "/api/payments-webhook",
  require("./middleware/rawBody"),
  require("./controllers/PaymentController").phonePeWebhook
);

app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/admin", admin);
app.use("/api/user", User);
app.use("/api/rooms", Rooms);
app.use("/api/tickets", Tickets);
app.use("/api/events", Events);
app.use("/api/common", Common);
app.use("/api/user-by-superadmin", UserByAdminRoutes);
app.use("/api/book-room", BookRoomRoute);
app.use("/api/payments", PaymentRoutes);
app.use("/api/booking-payments", BookingPaymentRoutes);
app.use("/api/announcement", AnnouncementRoute);
app.use("/api/property", PropertyRoute);
app.use("/api/admin-booking", AdminBooking);
app.use("/api/user-and-booking", UserAndBookingDetails);
app.use("/api/pages", PagesRoute);
app.use("/api/inventory", InventoryRoutes);
app.use("/api/service-history", ServiceHistoryRoutes);
app.use("/api/food-menu", FoodMenuRoute);
app.use("/api/activity", ActivityRoute);
app.use("/api/pan", panRoutes);
app.use("/api/digilocker", digilocker);
app.use("/api/admin/user", UserKYCRoutes);
app.use("/api/logs", AuditLogRoutes);
app.use('/api/fcm', FcmRoutes);
app.use("/api/dashboard", DashboardRoutes);
app.use("/api/user", UserDashboardRoutes);

sequelize
  .sync({ alter: true }) //   ensures new models are created
  .then(() => console.log("✅ Database Synced"))
  .catch((err) => console.log("❌ Sync Error:", err));

module.exports = app;
