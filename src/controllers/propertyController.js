const sequelize = require('../config/database');
const { Op, json } = require('sequelize');
const Property = require('../models/property');
const e = require('express');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const fs = require('fs');
const path = require('path');
const PropertyRateCard = require('../models/propertyRateCard');


exports.createProperty = async (req, res) => {
  try {
    const { name, address, description, images, amenities, is_active, rateCard } = req.body;

    // Check if property already exists
    const existing = await Property.findOne({ where: { name, address } });
    if (existing) {
      return res.status(400).json({ message: "Property already exists" });
    }

    // Convert amenities to array if needed
    const amenitiesArray = Array.isArray(amenities)
      ? amenities
      : amenities?.split(",").map(a => a.trim()) || [];

    // Handle images
    const imageUrls = req.files
      ? req.files.map(file => `/uploads/propertyImages/${file.filename}`)
      : [];

    if (imageUrls.length > 20) {
      return res.status(400).json({ message: "You can upload a maximum of 20 images." });
    }

    // Create the property
    const property = await Property.create({
      name,
      address,
      description,
      images: imageUrls,
      amenities: amenitiesArray,
      is_active,
    });

    // Handle rate card if provided
    if (rateCard) {
      const rateCardArray = typeof rateCard === "string" ? JSON.parse(rateCard) : rateCard;

      if (Array.isArray(rateCardArray) && rateCardArray.length > 0) {
        const rateCardsToCreate = rateCardArray.map(rc => ({
          propertyId: property.id,
          roomType: rc.roomType,
          rent: parseFloat(rc.rent),
        }));
        await PropertyRateCard.bulkCreate(rateCardsToCreate);
      }
    }

    res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create property" });
  }
};

exports.getProperties = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows: properties, count } = await Property.findAndCountAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: PropertyRateCard, as: "rateCard" }],
      limit,
      offset
    });
    const totalPages=Math.ceil(count / limit);
    //for frontend
    res.json({ properties, currentPage: page, totalPages });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties" });
  }
};

exports.editProperties = async (req, res) => {

  try {
    const { id } = req.params;
    let { name, address, description, images, amenities, is_active, removedImages, rateCard } = req.body;

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

    // Start with current images
    let updatedImages = [...(property.images || [])];

    // Remove selected old images from disk
    updatedImages = updatedImages.filter(img => !removedImages.includes(img));
    for (const imgUrl of removedImages) {
      try {
        const filePath = path.join(__dirname, '..', imgUrl.replace(/^\//, ''));
        if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
      } catch (err) {
        console.error(`Failed to delete file ${imgUrl}:`, err);
      }
    }

    // Add new uploaded images (only File objects)
    if (req.files && req.files.length > 0) {
      const newImageUrls = req.files.map(f => `/uploads/propertyImages/${f.filename}`);

      // Calculate total number of images after adding new ones
      const totalImages = updatedImages.length + newImageUrls.length;

      // Check limit
      if (totalImages > 20) {
        // Delete newly uploaded files to prevent folder overflow
        req.files.forEach(f => {
          const filePath = path.join(__dirname, '..', 'uploads/propertyImages', f.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        return res.status(400).json({
          message: `You can upload up to 20 images only. Currently: ${updatedImages.length} existing + ${newImageUrls.length} new = ${totalImages}.`
        });
      }

      // Merge new images with existing ones
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

    //rate card 
    if (rateCard) {
      const rateCardArray = typeof rateCard === "string" ? JSON.parse(rateCard) : rateCard;

      //existing rate
      const existingRateCard = await PropertyRateCard.findAll({ where: { propertyId: id } });

      //delete removed rows
      const roomTypesToKeep = rateCardArray.map(rc => rc.roomType.toLowerCase());
      const toDelete = existingRateCard.filter(rc => !roomTypesToKeep.includes(rc.roomType.toLowerCase()));
      if (toDelete.length > 0) {
        await PropertyRateCard.destroy({ where: { id: toDelete.map(r => r.id) } });
      }

      //for updating existing and add new 
      for (const rc of rateCardArray) {
        const existing = existingRateCard.find(r => r.roomType.toLowerCase() === rc.roomType.toLowerCase());
        if (existing) {
          await existing.update({ rent: rc.rent })
        }
        else {
          await PropertyRateCard.create({ propertyId: id, roomType: rc.roomType, rent: rc.rent });
        }
      }
    }

    res.status(200).json({ message: "Property updated successfully", property });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update property" });
  }

}

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;

    const property = await Property.findByPk(id, {
      include: { model: Rooms, as: 'rooms', include: { model: Booking, as: 'bookings' } }
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

exports.checkRateCardDeletion = async (req, res) => {
  try {
    const { propertyId, roomType } = req.body;

    const property = await Property.findByPk(propertyId, {
      include: { model: Rooms, as: 'rooms', include: { model: Booking, as: 'bookings' } }
    });

    if (!property) return res.status(404).json({ message: "Property not found" });

    const roomsOfType = property.rooms.filter(r => r.roomType === roomType);
    const hasActiveBooking = roomsOfType.some(r =>
      r.bookings.some(b => (b.status === 'approved' || b.status === 'pending') &&
        new Date(b.checkOutDate) >= new Date())
    );

    res.json({ canDelete: !hasActiveBooking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to check deletion" });
  }
};

