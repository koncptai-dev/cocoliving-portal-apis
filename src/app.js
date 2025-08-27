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

app.use(cors({
    origin: '*', // Allow only your frontend's IP
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // if you're using cookies/sessions
}));

app.use(bodyParser.json());

app.use('/api/admin', admin);
app.use('/api/user', User);
app.use('/api/rooms', Rooms);
app.use('/api/tickets', Tickets);
app.use('/api/events', Events);
app.use('/api/common', Common);
app.use('/api/user-by-admin', UserByAdminRoutes);
app.use('/api/book-room', BookRoomRoute);
app.use('/api/announcement', AmmouncementRoute); 

sequelize.sync({ alter: true }) //   ensures new models are created
  .then(() => console.log('✅ Database Synced'))
  .catch((err) => console.log('❌ Sync Error:', err));

module.exports = app;