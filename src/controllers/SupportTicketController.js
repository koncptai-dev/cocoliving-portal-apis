const sequelize = require('../config/database');
const SupportTicket = require('../models/supportTicket');
const Rooms = require('../models/rooms');
const User = require('../models/user');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const { Op } = require('sequelize');

//create tickets

exports.createTicket = async (req, res) => {
    try {
        const userId = req.user.id;

        const { roomNumber, date, issue, description, priority } = req.body;

        //validation
        if (!roomNumber || !date || !issue) {
            return res.status(400).json({ message: "Please provide all required fields" });
        }

        //check room exists
        const room = await Rooms.findOne({ where: { roomNumber } });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        //check user has booked the room 
        const booking = await Booking.findOne({
            where: { userId: userId },
            include: [{
                model: Rooms,
                as: "room",
                where: { roomNumber: req.body.roomNumber }
            }]
        });

        if (!booking) {
            return res.status(403).json({ message: "You have not booked this room" });
        }

        //for images&video up to 10
        const imageUrls = req.files?.ticketImage?.map(file => `/uploads/ticketImages/${file.filename}`) || [];
        const videoUrls = req.files?.ticketVideo?.map(file => `/uploads/ticketVideos/${file.filename}`) || [];


        if (imageUrls.length > 10) {
            return res.status(400).json({ message: "You can upload a maximum of 10 images." });
        }
        if (videoUrls.length > 3) {
            return res.status(400).json({ message: "You can upload a maximum of 3 videos." });
        }

        const ticket = await SupportTicket.create({
            roomId: room.id,
            roomNumber: room.roomNumber,
            date,
            issue,
            description,
            priority,
            userId,
            status: 'open',
            image: imageUrls,
            videos: videoUrls
        })

        res.status(201).json({ message: "successfully created", ticket });
    } catch (error) {
        console.log(error);

        res.status(500).json({ message: error.message });
    }
}

//users view own tickets 
exports.getUserTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const userId = req.user.id;

        const { rows: tickets, count } = await SupportTicket.findAndCountAll({
            where: {
                userId: userId
            }, 
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });
        const totalPages=Math.ceil(count / limit);

        res.status(200).json({ tickets, currentPage: page, totalPages, totalTickets: count });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
}

//admin view tickets
exports.getAllTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { rows: tickets, count } = await SupportTicket.findAndCountAll({
            include: [
                {
                    model: Rooms,
                    as: 'room',      // Make sure your association is defined: SupportTicket.belongsTo(Rooms, { as: 'room', foreignKey: 'roomId' })
                    attributes: ['id', 'roomNumber', 'propertyId'],
                    include: [
                        {
                            model: Property,
                            as: 'property', // Make sure Rooms.belongsTo(Property, { as: 'property', foreignKey: 'propertyId' })
                            attributes: ['id', 'name']
                        }
                    ]
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'fullName', 'email']
                }
            ],
            limit,
            offset, order: [['createdAt', 'DESC']]
        });
        const totalPages = Math.ceil(count / limit);

        res.status(200).json({ tickets, totalPages });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
}

//admin updates  ticket status
exports.updateTicketStatus = async (req, res) => {
    const ticketId = req.params.id;
    try {
        const { status, assignedTo } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role;

        const ticket = await SupportTicket.findByPk(ticketId);

        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        if (userRole === 1) {
            if (status) ticket.status = status;
            if (assignedTo) ticket.assignedTo = assignedTo;
        }
        else if (userRole === 3) {
            if (ticket.assignedTo !== userId) {
                return res.status(403).json({ message: "You are not assigned to this ticket" });
            }
            if (status) ticket.status = status;
        }
        await ticket.save();

        res.status(200).json({ message: "Ticket updated successfully", ticket });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/rooms?status=active
exports.getRooms = async (req, res) => {
    try {
        const today = new Date();
        const userId = req.user.id;
        // Find bookings that are approved and currently active
        const activeBookings = await Booking.findAll({
            where: {
                status: 'approved',
                userId: userId,
                checkInDate: { [Op.lte]: today },
                checkOutDate: { [Op.gte]: today },
            },
            include: [
                {
                    model: Rooms,
                    as: 'room',
                    attributes: ['roomNumber'], // only need roomNumber
                    include: [
                        {
                            model: Property,
                            as: 'property',
                            attributes: ['name'], // include property name
                        }
                    ]
                },
            ],
        });

        // Extract unique room numbers
        const rooms = activeBookings
            .map(b => b.room)
            .filter(Boolean)
            .map(r => ({ id: r.id, roomNumber: r.roomNumber, propertyName: r.property?.name || "", }));

        res.status(200).json({ rooms });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
