const sequelize = require('../config/database');
const User = require('../models/user');
const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const Property = require('../models/property');
const { Op } = require('sequelize');
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
            return res.status(404).json({ message: 'No user found' });
        }

        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error fetching user details', error: err.message });
    }
};
