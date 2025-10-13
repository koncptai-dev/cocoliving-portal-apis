const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sequelize = require('./config/database');
const app = express();
const admin=require('./routes/AdminRoutes');
const User=require('./routes/UserRoute');
const Rooms=require('./routes/RoomsRoutes'); 
const Tickets=require('./routes/SupportTicketRoutes');
const Events=require('./routes/EventRoutes')
const Common=require('./routes/CommonRoutes');
const UserByAdminRoutes=require('./routes/UserByAdminRoutes');
const BookRoomRoute=require('./routes/RoomBookRoute');
const AmmouncementRoute=require('./routes/AnnouncementRoute');
const PropertyRoute=require('./routes/PropertyRoute');
const AdminBooking=require('./routes/AdminBookingRoutes');
const UserandBokingDetails = require('./routes/UserandBookingRoutes');
const PagesRoute = require('./routes/pagesRoute');

const path = require('path');

app.use(cors({
    origin: '*', // Allow only your frontend's IP
    methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH'],
    credentials: true // if you're using cookies/sessions
}));

app.use(bodyParser.json());
app.use('/src/uploads', express.static(path.join(__dirname, 'src', 'uploads')));

app.use('/api/admin', admin);
app.use('/api/user', User);
app.use('/api/rooms', Rooms);
app.use('/api/tickets', Tickets);
app.use('/api/events', Events);
app.use('/api/common', Common);
app.use('/api/user-by-superadmin', UserByAdminRoutes);
app.use('/api/book-room', BookRoomRoute);
app.use('/api/announcement', AmmouncementRoute); 
app.use('/api/property', PropertyRoute);
app.use('/api/admin-booking', AdminBooking);
app.use('/api/user-and-booking', UserandBokingDetails);
app.use('/api/pages', PagesRoute);

sequelize.sync({ alter: true }) //   ensures new models are created
  .then(() => console.log('✅ Database Synced'))
  .catch((err) => console.log('❌ Sync Error:', err));

module.exports = app;