const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const { Op } = require('sequelize');


//Add Rooms  for admin
exports.AddRooms = async (req, res) => {
    try {
        const { propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount, preferredUserType, description, availableForBooking } = req.body;

        //check property exist or not
        const property = await Property.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ message: "Property not found" });
        }

        //check rooms are exist -> unique room number
        const existingRoom = await Rooms.findOne({ where: { roomNumber, propertyId } });
        if (existingRoom) {
            return res.status(400).json({ message: "Room already exists for this property" });
        }

        const status = availableForBooking ? "available" : "not-available";

        const calculatedDeposit = monthlyRent * 2;

        const newRooms = await Rooms.create({
            propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount: calculatedDeposit, preferredUserType,
             description, status
        })        

        res.status(201).json({ message: 'Rooms added successfully', room: newRooms })

    } catch (err) {
        console.log("error->", err
        );

        return res.status(500).json({ message: "Internal server error" });
    }
}

// Edit Rooms
exports.EditRooms = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;

        //find existing room
        const room = await Rooms.findByPk(id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        //check duplicate room number 
        if (updatedData.roomNumber && updatedData.roomNumber !== room.roomNumber) {
            const exist = await Rooms.findOne({ where: { roomNumber: updatedData.roomNumber, propertyId: room.propertyId, id: { [Op.ne]: room.id } } });
            if (exist) {
                return res.status(400).json({ message: "Room number already exists for this property" });
            }
        }

        // Update status if availableForBooking is passed
        if (updatedData.availableForBooking !== undefined) {
            updatedData.status = updatedData.availableForBooking ? "available" : "not-available";
        }

        //recalculate deposit if rent changes
        if (updatedData.monthlyRent !== null && updatedData.monthlyRent !== undefined) {
            updatedData.depositAmount = updatedData.monthlyRent * 2;
        }

        //apply update dynamically
        await room.update({
            ...updatedData,  // keep other updates
        });

        res.status(200).json({ message: "Room updated successfully", room });

    } catch (err) {
        console.log("error", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// delete Rooms
exports.DeleteRooms = async (req, res) => {
    try {

        const { id } = req.params;

        const room = await Rooms.findByPk(id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        const today = new Date();

        const hasActiveOrFutureBookings = await Booking.findOne({
            where: {
                roomId: id,
                status: { [Op.in]: ["approved", "pending"] },
                checkOutDate: { [Op.gte]: today }
            }
        });

        if (hasActiveOrFutureBookings) {
            return res.status(400).json({ message: "Room cannot be deleted, it has active or future bookings" });
        }


        // Delete all images from folder
        if (room.images && room.images.length > 0) {
            for (const imgUrl of room.images) {
                const filePath = path.join(__dirname, "..", imgUrl.replace(/^\//, ""));
                if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
            }
        }


        await room.destroy();
        res.status(200).json({ message: "Room deleted successfully" });

    } catch (err) {
        console.log("error", err);

        return res.status(500).json({ message: "Internal server error" });
    }
}

//get Rooms
exports.getAllRooms = async (req, res) => {
    try {
        const role= req.query.role || 'user';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { rows: rooms, count } = await Rooms.findAndCountAll(
            {
                include: [
                    {
                        model: Booking,
                        as: 'bookings',
                        where: { status: { [Op.notIn]: ['rejected', 'cancelled'] } },
                        required: false
                    },
                    {
                        model: Property,
                        as: 'property',
                    }
                ],
                limit,
                offset,order:[['createdAt', 'DESC']]
            }
        )

        const formattedRooms = rooms.map((room) => {
            const capacity = room.capacity;
            const occupied = room.bookings ? room.bookings.length : 0;

            let status;

            if (room.status === "not-available") {
                status = "not-available"; // admin blocked
            } else {
                // admin allowed
                if (occupied >= capacity) {
                    status = "sold"; // fully occupied
                } else {
                    status = "available"; // still space left
                }
            }

            return {
                id: room.id,
                propertyId: room.propertyId,
                roomNumber: room.roomNumber,
                roomType: room.roomType,
                capacity,
                floorNumber: room.floorNumber,
                monthlyRent: room.monthlyRent,
                depositAmount: room.depositAmount,
                preferredUserType: room.preferredUserType,
                amenities: room.amenities || [],
                description: room.description,
                images: room.images || [],
                status,
                occupancy: `${occupied}/${capacity}`,
                property: room.property ? {
                    id: room.property.id,
                    name: room.property.name,
                    address: room.property.address,
                    amenities: room.property.amenities,
                    images: room.property.images,
                } : null
            };
        });

        const totalPages=Math.ceil(count / limit);

        res.status(200).json({ rooms: formattedRooms,currentPage: page, totalPages, totalRooms: count });
    } catch (err) {
        console.log("error", err);

        return res.status(500).json({ message: "Internal server error" });
    }

}