const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Property = require('../models/property');
const e = require('express');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');

exports.createProperty = async (req, res) => {
  try {
    const { name, address, description, images, amenities, is_active } = req.body;

    const existing = await Property.findOne({ where: { name, address } });

    if (existing) {
      return res.status(400).json({ message: "Property already exists" });
    }

    // Ensure and amenities are arrays
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || [];

    //handle images
    const imageUrls = req.files ? req.files.map(file => `/uploads/propertyImages/${file.filename}`) : [];

    const property = await Property.create({
      name,
      address,
      description,
      images: imageUrls,
      amenities: amenitiesArray,
      is_active: is_active,

    });
    res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create property" });
  }
}

exports.getProperties = async (req, res) => {
  try {
    const properties = await Property.findAll({ order: [["createdAt", "DESC"]] });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties" });
  }
};

exports.editProperties = async (req, res) => {

  try {
    const { id } = req.params;
    let { name, address, description, images, amenities, is_active, removedImages } = req.body;

    const property = await Property.findByPk(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    //check another property with same name 
    if (name) {
      const existing = await Property.findOne({
        where: {
          name, id: { [Op.ne]: id }
        }
      })
      if (existing) {
        return res.status(400).json({ message: "Property with same name already exists" });
      }
    }
    //  amenities are arrays
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || property.amenities;


    //  removedImages to always be an array
    if (!removedImages) { removedImages = []; }
    else if (typeof removedImages === "string") {
      removedImages = [removedImages]; // single string -> array
    }
  
    let updatedImages = [...(property.images || [])];

    // remove selected images
    if (removedImages.length > 0) {
      updatedImages = updatedImages.filter(img => !removedImages.includes(img));
    }

    // add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImageUrls = req.files.map(file => `/uploads/propertyImages/${file.filename}`);
      updatedImages = [...updatedImages, ...newImageUrls];
    }

    await property.update({
      name: name ?? property.name,
      address: address ?? property.address,
      description: description ?? property.description,
      images: updatedImages,
      amenities: amenities !== undefined ? amenitiesArray : property.amenities,
      is_active: is_active !== undefined ? is_active : property.is_active,
    });
    res.status(200).json({ message: "Property updated successfully", property });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update property" });
  }

}

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;

    const property = await Property.findByPk(id,{
      include:{model:Rooms,as:'rooms',include:{model:Booking,as:'bookings'}}
    });
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    } 
    
    const today = new Date();

    const hasActiveOrFutureBookings = property.rooms.some(room => 
      room.bookings.some(booking => 
        (booking.status === 'approved' || booking.status === 'pending') &&
        new Date(booking.checkOutDate) >= today
      )
    );

    if (hasActiveOrFutureBookings) {
      return res.status(400).json({ message: "Cannot delete property: some rooms have active or future bookings." });
    }

    await property.destroy();

    res.status(200).json({ message: "Property deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete property" });
  }
}