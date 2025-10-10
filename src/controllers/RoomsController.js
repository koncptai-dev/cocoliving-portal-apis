const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const Property = require('../models/property');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

//Add Rooms  for admin
exports.AddRooms = async (req, res) => {
    try {
        const { propertyId, roomNumber, roomType, capacity, floorNumber, monthlyRent, depositAmount, preferredUserType, amenities, description, availableForBooking } = req.body;

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
        const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || [];

        //handle images
        const imageUrls = req.files ? req.files.map(file => `/uploads/roomImages/${file.filename}`) : [];

        // Check limit
        if (imageUrls.length > 20) {
            return res.status(400).json({ message: "You can upload a maximum of 20 images per room" });
        }

        const newRooms = await Rooms.create({
            propertyId, roomNumber, roomType, capacity, floorNumber, images: imageUrls, monthlyRent, depositAmount, preferredUserType,
            amenities: amenitiesArray, description, status
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

        //aminities array handling
        if (updatedData.amenities !== undefined && updatedData.amenities !== null) {
            updatedData.amenities = Array.isArray(updatedData.amenities)
                ? updatedData.amenities
                : updatedData.amenities.split(',').map(a => a.trim()).filter(a => a);
        }

        // already stored images
        let updatedImages = room.images || [];

        // removedImages passed from frontend
        let removedImages = updatedData.removedImages || [];
        if (typeof removedImages === "string") removedImages = [removedImages]; // single string -> array

        // Remove selected images from array
        updatedImages = updatedImages.filter(img => !removedImages.includes(img));

        // Delete files from folder
        for (const imgUrl of removedImages) {
            const filePath = path.join(__dirname, "..", imgUrl.replace(/^\//, ""));
            if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
        }

        // Add new uploaded images
        if (req.files && req.files.length > 0) {
            const newImageUrls = req.files.map(f => `/uploads/roomImages/${f.filename}`);
            if (updatedImages.length + newImageUrls.length > 20) {
                return res.status(400).json({
                    message: `Cannot upload images. Room already has ${updatedImages.length} images. Maximum allowed is 20.`
                });
            }
            updatedImages = [...updatedImages, ...newImageUrls];
        }

        // Save final array
        updatedData.images = updatedImages;

        //apply update dynamically
        await room.update({
            ...updatedData,  // keep other updates
            images: updatedImages  //  images field to update
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
        const rooms = await Rooms.findAll(
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
                ]
            }
        )

        //         const formattedRooms=rooms.map((room)=>{
        //             const capacity=room.capacity;
        //             const occupied=room.bookings ? room.bookings.length : 0;
        // let status = room.status;

        //   if (status === "available" && occupied >= capacity) {
        //     status = "booked";
        //   }

        //   const availableForBooking = status === "available";
        //             // const availableForBooking = room.status==='available' && occupied < capacity

        //             console.log(availableForBooking);

        //             return{
        //                 id: room.id,
        //                 propertyId: room.propertyId,
        //                 roomNumber: room.roomNumber,
        //                 roomType: room.roomType,
        //                 capacity:capacity,
        //                 floorNumber: room.floorNumber,
        //                 monthlyRent: room.monthlyRent,
        //                 depositAmount: room.depositAmount,
        //                 preferredUserType: room.preferredUserType,
        //                 amenities: room.amenities || [],        
        //                 description: room.description,
        //                 availableForBooking,
        //                 status,
        //                 // availableForBooking: availableForBooking,
        //                 // status: room.status,
        //                 occupancy:`${occupied}/${capacity}`,
        //                  property: room.property ? {
        //                     id: room.property.id,
        //                     name: room.property.name,
        //                     address: room.property.address,
        //                     amenities: room.property.amenities,
        //                     images: room.property.images,
        //                     } : null
        //                             }
        //         })

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

        res.status(200).json({ rooms: formattedRooms });
    } catch (err) {
        console.log("error", err);

        return res.status(500).json({ message: "Internal server error" });
    }

}