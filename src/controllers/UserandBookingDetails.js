const sequelize = require('../config/database');
const User = require('../models/user');
const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const Property = require('../models/property');
const { Op } = require('sequelize');
const { logApiCall } = require("../helpers/auditLog");
require('dotenv').config();

// Get user details with booking history
exports.getUserDetailsWithBookings = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findOne({
            where: { id, status: 1 },
            attributes: { exclude: ['password'] },
            include: [
                {
                    model: Booking,
                    as: 'bookings',
                    include: [
                        {
                            model: Rooms,
                            as: 'room',
                            include: [
                                { model: Property, as: "property", attributes: ["id", "name"] } // property info
                            ]
                        },

                    ]
                }
            ],
            order: [[{ model: Booking, as: 'bookings' }, 'createdAt', 'DESC']]
        });

        if (!user) {
            await logApiCall(req, res, 404, `Viewed user details with bookings - user not found (ID: ${id})`, "user", parseInt(id));
            return res.status(404).json({ message: 'No user found' });
        }

        await logApiCall(req, res, 200, `Viewed user details with bookings (ID: ${id})`, "user", parseInt(id));
        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error(err);
        await logApiCall(req, res, 500, "Error occurred while fetching user details with bookings", "user", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: 'Error fetching user details', error: err.message });
    }
};
