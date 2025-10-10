const sequelize = require('../config/database');
const SupportTicket = require('../models/supportTicket');
const Rooms = require('../models/rooms');
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

        const ticket = await SupportTicket.create({
            roomId: room.id,
            roomNumber: room.roomNumber,
            date,
            issue,
            description,
            priority,
            userId,
            status: 'open'
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
        const userId = req.user.id;

        const tickets = await SupportTicket.findAll({
            where: {
                userId: userId
            }
        });

        res.status(200).json({ tickets });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
}

//admin view tickets
exports.getAllTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.findAll({
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
                }
            ]
        });
        res.status(200).json({ tickets });
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

        const ticket = await SupportTicket.findByPk(ticketId);

        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found" });
        }

        ticket.status = status;
        ticket.assignedTo = assignedTo || ticket.assignedTo;

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
            .map(r => ({ id: r.id, roomNumber: r.roomNumber ,propertyName: r.property?.name  || "",}));

        res.status(200).json({ rooms });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
