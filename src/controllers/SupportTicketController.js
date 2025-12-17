const sequelize = require('../config/database');
const SupportTicket = require('../models/supportTicket');
const Rooms = require('../models/rooms');
const User = require('../models/user');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const Inventory = require('../models/inventory');
const { Op } = require('sequelize');
const { logTicketEvent } = require("../utils/ticketLog");
const { generateSupportTicketCode } = require('../helpers/SupportTicketCode');

//create tickets
exports.createTicket = async (req, res) => {
    try {
        const userId = req.user.id;

        const { roomNumber, date, issue, description, priority, inventoryId } = req.body;

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
            where: { userId },
            include: [{
                model: Rooms,
                as: "room",
                where: { roomNumber }
            }]
        });

        if (!booking || !booking.roomId) {
            return res.status(403).json({ message: "You have not booked this room" });
        }
        // Optional inventory item linking
        let inventoryName = null;
        if (inventoryId) {
            const Inventory = require("../models/inventory");
            const inventory = await Inventory.findOne({ where: { id: inventoryId } });

            if (!inventory) {
                return res.status(404).json({ message: "Selected inventory item not found" });
            }

            // Optional validation: ensure inventory belongs to this room
            if (inventory.roomId !== room.id) {
                return res.status(403).json({ message: "This inventory item is not part of your room" });
            }

            inventoryName = inventory.itemName;
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

        const supportCode = await generateSupportTicketCode(room.propertyId , room.roomNumber);

        const ticket = await SupportTicket.create({
            supportCode,
            roomId: room.id,
            roomNumber: room.roomNumber,
            propertyId: room.propertyId,
            date,
            issue,
            description,
            priority,
            userId,
            status: 'open',
            image: imageUrls,
            videos: videoUrls,
            inventoryId: inventoryId || null,
            inventoryName: inventoryName || null,
        })
        await logTicketEvent({
            ticketId: ticket.id,
            actionType: "TICKET_CREATED",
            newValue: { status: ticket.status },
            actorId: userId,
        });

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
                    as: 'room',     
                    attributes: ['id', 'roomNumber', 'propertyId'],
                    include: [
                        {
                            model: Property,
                            as: 'property',
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
        const { status, assignedTo, resolutionNotes } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role;

        const ticket = await SupportTicket.findByPk(ticketId);

        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found" });
        }
        // Super Admin
        if (userRole === 1) {
            if ( typeof status !== "undefined" && status !== ticket.status ) {
            await logTicketEvent({
                ticketId: ticket.id,
                actionType: "STATUS_UPDATE",
                oldValue: { status: ticket.status },
                newValue: { status },
                actorId: userId,
            });

            ticket.status = status;
            }

            // ASSIGNMENT CHANGE
            if ( typeof assignedTo !== "undefined" && assignedTo !== ticket.assignedTo ) {
            await logTicketEvent({
                ticketId: ticket.id,
                actionType: "ASSIGNMENT",
                oldValue: { assignedTo: ticket.assignedTo },
                newValue: { assignedTo },
                actorId: userId,
            });

            ticket.assignedTo = assignedTo;
            }
        }
        // Normal Admin
        else if (userRole === 3) {
            if (ticket.assignedTo !== userId) {
                return res.status(403).json({ message: "You are not assigned to this ticket" });
            }
            // STATUS CHANGE
            if (typeof status !== "undefined" && status !== ticket.status) {
                await logTicketEvent({
                    ticketId: ticket.id,
                    actionType: "STATUS_UPDATE",
                    oldValue: { status: ticket.status },
                    newValue: { status },
                    actorId: userId,
                });

                ticket.status = status;
            }
        }

        // Resolution Notes validation
        const previousResolutionNotes = ticket.resolutionNotes;

        if ( typeof resolutionNotes !== "undefined" && resolutionNotes !== previousResolutionNotes ) {
            const effectiveStatus = typeof status !== "undefined" ? status : ticket.status;
            if (!["resolved"].includes(effectiveStatus)) {
                return res.status(400).json({
                message: "Resolution notes can only be added when status is resolved",
                });
            }

            if ( userRole !== 1 && !(userRole === 3 && ticket.assignedTo === userId )) {
                return res.status(403).json({ message: "Only assigned admins can add resolution notes", });
            }
            if (resolutionNotes !== null && resolutionNotes.trim() === "") {      
                return res.status(400).json({ message: "Resolution notes cannot be empty", });
            }
            ticket.resolutionNotes = resolutionNotes;

            await logTicketEvent({
                ticketId: ticket.id,
                actionType: previousResolutionNotes
                ? "RESOLUTION_NOTES_UPDATED"
                : "RESOLUTION_NOTES_ADDED",
                oldValue: previousResolutionNotes
                ? { resolutionNotes: previousResolutionNotes }
                : null,
                newValue: { resolutionNotes },
                actorId: userId,
            });
        }


        await ticket.save();
        if (ticket.status && ["in-progress", "resolved"].includes(ticket.status.toLowerCase())) {
            const { createFromTicket } = require("../controllers/serviceHistoryController");
            await createFromTicket(ticket);
        }
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
                roomId: { [Op.ne]: null }
            },
            include: [
                {
                    model: Rooms,
                    as: 'room',
                    attributes: ['id','roomNumber','propertyId'], // only need roomNumber
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
            .map((b) => b.room)
            .filter(Boolean)
            .map((r) => ({
                id: r.id,
                roomNumber: r.roomNumber,
                propertyId: r.propertyId,
                propertyName: r.property?.name || '',
            }));
        res.status(200).json({ rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.getTicketDetails = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const loggedInUser = req.user;

    const ticket = await SupportTicket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "phone"],
        },
        {
          model: Rooms,
          as: "room",
          attributes: ["id", "roomNumber", "propertyId"],
          include: [
            {
              model: Property,
              as: "property",
              attributes: ["id", "name", "address"],
            },
          ],
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (loggedInUser.role === 2) {
      if (ticket.userId !== loggedInUser.id) {
        return res.status(403).json({ message: "You are not allowed to view this ticket" });
      }
    }
    let assignedAdmin = null;
    if (ticket.assignedTo) {
      assignedAdmin = await User.findOne({
        where: { id: ticket.assignedTo },
        attributes: ["id", "fullName", "email", "role"],
      });
    }

    let inventory = null;
    if (ticket.inventoryId) {
      inventory = await Inventory.findOne({
        where: { id: ticket.inventoryId },
        attributes: ["id", "inventoryCode", "itemName", "category", "status"],
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket details fetched",
      ticket,
      assignedAdmin,
      inventory,
    });

  } catch (error) {
    console.log("getTicketDetails error:", error);
    return res.status(500).json({ message: error.message });
  }
};
