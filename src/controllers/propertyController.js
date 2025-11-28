const sequelize = require('../config/database');
const { Op, json } = require('sequelize');
const Property = require('../models/property');
const e = require('express');
const Rooms = require('../models/rooms');
const Booking = require('../models/bookRoom');
const fs = require('fs');
const path = require('path');
const PropertyRateCard = require('../models/propertyRateCard');
const { log } = require('console');

//helper for preventing adding image into property and room Image
const deleteFiles = (files) => {
  files.forEach(f => {
    const folder = f.fieldname.startsWith('propertyImages') ? 'propertyImages' : 'roomImages';
    const filePath = path.join(__dirname, '..', 'uploads', folder, f.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
};

exports.createProperty = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, address, description, amenities, is_active, rateCard } = req.body;

    // Check if property already exists
    const existing = await Property.findOne({ where: { name, address }, transaction: t });
    if (existing) {
      deleteFiles(req.files || []);
      await t.rollback();
      return res.status(400).json({ message: "Property already exists" });
    }

    // Convert amenities to array if needed
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || [];

    // Handle images for property
    const propertyFiles = req.files?.filter(f => f.fieldname === 'propertyImages') || [];
    const imageUrls = propertyFiles.map(f => `/uploads/propertyImages/${f.filename}`);


    if (imageUrls.length > 20) {
      deleteFiles(propertyFiles);
      await t.rollback();
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
    }, { transaction: t });

    // Handle rate card 
    if (rateCard) {
      const rateCardArray = typeof rateCard === "string" ? JSON.parse(rateCard) : rateCard;

      if (Array.isArray(rateCardArray) && rateCardArray.length > 0) {
        const rateCardsToCreate = [];

        for (const rc of rateCardArray) {
          const roomImages = req.files?.filter(f => f.fieldname === `roomImages_${rc.roomType}`) || [];
          const roomImageUrls = roomImages.map(f => `/uploads/roomImages/${f.filename}`);

          if (roomImageUrls.length > 10) {
            deleteFiles([...propertyFiles, ...roomImages]);
            await t.rollback();
            return res.status(400).json({ message: `You can upload maximum of 10 images for room type ${rc.roomType}` })
          }

          const amenitiesArray = Array.isArray(rc.roomAmenities) ? rc.roomAmenities : rc.roomAmenities?.split(",").map(a => a.trim()) || [];

          rateCardsToCreate.push({
            propertyId: property.id,
            roomType: rc.roomType,
            rent: parseFloat(rc.rent),
            roomAmenities: amenitiesArray,
            roomImages: roomImageUrls,
          });
        }
        await PropertyRateCard.bulkCreate(rateCardsToCreate, { transaction: t });
      }
    }

    await t.commit();
    res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    deleteFiles(req.files || []);
    await t.rollback();
    console.error(error);
    res.status(500).json({ message: "Failed to create property" });
  }
};

exports.editProperties = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    let { name, address, description, images, amenities, is_active, removedImages, rateCard } = req.body;

    const property = await Property.findByPk(id, { transaction: t });
    if (!property) { await t.rollback(); return res.status(404).json({ message: "Property not found" }); }

    // Check duplicate name
    if (name) {
      const existing = await Property.findOne({
        where: { name, id: { [Op.ne]: id } }, transaction: t
      });
      if (existing) { await t.rollback(); return res.status(400).json({ message: "Property with same name already exists" }); }
    }

    // Amenities array
    const amenitiesArray = Array.isArray(amenities)
      ? amenities
      : amenities?.split(",").map(a => a.trim()) || property.amenities;

    // Removed images to array
    if (!removedImages) removedImages = [];
    else if (typeof removedImages === "string") removedImages = [removedImages];

    // Current property images
    let updatedImages = [...(property.images || [])];

    // Remove old images
    updatedImages = updatedImages.filter(img => !removedImages.includes(img));
    for (const imgUrl of removedImages) {
      try {
        const filePath = path.join(__dirname, '..', imgUrl.replace(/^\//, ''));
        if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
      } catch (err) {
        console.error(`Failed to delete file ${imgUrl}:`, err);
      }
    }

    // Add new property images only
    const propertyFiles = req.files?.filter(f => f.fieldname === 'propertyImages') || [];
    const newPropertyImages = propertyFiles.map(f => `/uploads/propertyImages/${f.filename}`);

    // Total property images check
    if (updatedImages.length + newPropertyImages.length > 20) {
      await t.rollback();
      propertyFiles.forEach(f => {
        const filePath = path.join(__dirname, '..', 'uploads/propertyImages', f.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
      return res.status(400).json({ message: "You can upload up to 20 property images only." });
    }

    updatedImages = [...updatedImages, ...newPropertyImages];

    // Update property
    await property.update({
      name: name ?? property.name,
      address: address ?? property.address,
      description: description ?? property.description,
      images: updatedImages,
      amenities: amenities !== undefined ? amenitiesArray : property.amenities,
      is_active: is_active !== undefined ? is_active : property.is_active,
    }, { transaction: t });

    //for ratecard roomImages
    if (rateCard) {
      const rateCardArray = typeof rateCard === "string" ? JSON.parse(rateCard) : rateCard;

      for (const rc of rateCardArray) {
        // Fetch the existing rate card
        if (rc.id) {
          const existingRC = await PropertyRateCard.findByPk(rc.id, { transaction: t });

          if (existingRC) {
            // Prepare removedImages array for this rate card
          let removedRoomImages = Array.isArray(rc.removedRoomImages) ? rc.removedRoomImages : [];

            // Remove images from DB array
            let updatedRoomImages = [...(existingRC.roomImages || [])];
            updatedRoomImages = updatedRoomImages.filter(img => !removedRoomImages.includes(img));

            // Delete removed images from filesystem
            for (const imgUrl of removedRoomImages) {
              try {
                const filePath = path.join(__dirname, '..', imgUrl.replace(/^\//, ''));
                if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
              } catch (err) {
                console.error(`Failed to delete room image ${imgUrl}:`, err);
              }
            }

            // Add new uploaded room images
            const roomFiles = req.files?.filter(f => f.fieldname === `roomImages_${rc.roomType}`) || [];
            const newRoomImages = roomFiles.map(f => `/uploads/roomImages/${f.filename}`);

            // Check max 10 images per room
            if (updatedRoomImages.length + newRoomImages.length > 10) {
              await t.rollback();

              // Delete newly uploaded files to prevent orphan files
              roomFiles.forEach(f => {
                const filePath = path.join(__dirname, '..', 'uploads/roomImages', f.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              });
              return res.status(400).json({ message: `Max 10 images allowed for room type ${rc.roomType}` });
            }

            updatedRoomImages = [...updatedRoomImages, ...newRoomImages];

            const roomAmenitiesParsed = Array.isArray(rc.roomAmenities)
              ? rc.roomAmenities
              : rc.roomAmenities?.split(",").map(a => a.trim()) || existingRC.roomAmenities;

            // Update the rate card
            await existingRC.update({
              roomType: rc.roomType,
              rent: rc.rent !== undefined ? parseFloat(rc.rent) : existingRC.rent,
              roomImages: updatedRoomImages,
              roomAmenities: roomAmenitiesParsed
            }, { transaction: t });

          }
        } else {
          // If rate card didn't exist, create a new one (optional)
          const roomFiles = req.files?.filter(f => f.fieldname === `roomImages_${rc.roomType}`) || [];
          const roomImageUrls = roomFiles.map(f => `/uploads/roomImages/${f.filename}`);

          if (roomImageUrls.length > 10) {
            await t.rollback();
            // Delete newly uploaded files 
            roomFiles.forEach(f => {
              const filePath = path.join(__dirname, '..', 'uploads/roomImages', f.filename);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });
            return res.status(400).json({ message: `Max 10 images allowed for new room type ${rc.roomType}` });
          }

          const roomAmenitiesParsed = Array.isArray(rc.roomAmenities)
            ? rc.roomAmenities
            : rc.roomAmenities?.split(",").map(a => a.trim()) || existingRC.roomAmenities;

          await PropertyRateCard.create({
            propertyId: property.id,
            roomType: rc.roomType,
            rent: parseFloat(rc.rent),
            roomImages: roomImageUrls,
            roomAmenities: roomAmenitiesParsed
          }, { transaction: t });
        }
      }
    }
    await t.commit();
    res.status(200).json({ message: "Property updated successfully", property });

  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ message: "Failed to update property" });
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
    const totalPages = Math.ceil(count / limit);
    //for frontend
    res.json({ properties, currentPage: page, totalPages });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties" });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const today=new Date();

    const property = await Property.findByPk(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    //check for active or future booking
    const hasActiveOrFutureBookings = await Booking.findOne({
      where:{
        propertyId:id,
        status:{[Op.in]:["approved","pending"]},
        checkOutDate:{[Op.gte]:today}
      }
    });

    if (hasActiveOrFutureBookings) {
      return res.status(400).json({ message: "Cannot delete property: There are active or future bookings linked to this property." });
    }

    // --- Delete property and room images from server ---
    const propertyImages = property.images || []; // if Property has images column
    const roomImages = property.rooms.flatMap(room => room.images || []);
    const allImages = [...propertyImages, ...roomImages];

    allImages.forEach(imgPath => {
      const fullPath = path.join(__dirname, '..', imgPath.replace(/^\//, ''));
      fs.unlink(fullPath, (err) => {
        if (err) console.error(`Failed to delete file ${fullPath}:`, err);
      });
    });

    await property.destroy();

    res.status(200).json({ message: "Property deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete property" });
  }
}

exports.deleteRateCard = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { propertyId, roomType } = req.body;

    const today = new Date();
    const hasActiveOrFutureBooking = await Booking.findOne({
      where: {
        propertyId: propertyId,
        roomType: roomType,
        [Op.or]: [{ status: 'approved' }, { status: 'pending' }],
        checkOutDate: { [Op.gte]: today }
      },
      transaction: t
    });

    if (hasActiveOrFutureBooking) {
      await t.rollback();
      return res.status(400).json({ message: `Cannot delete: Room type "${roomType}" has active or future bookings.` });
    }

    const rateCardToDelete = await PropertyRateCard.findOne({
      where: { propertyId, roomType },
      transaction: t
    });

    if (!rateCardToDelete) {
      await t.rollback();
      return res.status(404).json({ message: "Rate card not found." });
    }

    // Delete images from file system
    if (rateCardToDelete.roomImages && rateCardToDelete.roomImages.length > 0) {
      for (const imgUrl of rateCardToDelete.roomImages) {
        try {
          const filePath = path.join(__dirname, '..', imgUrl.replace(/^\//, ''));
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete room image ${imgUrl}:`, err);
        }
      }
    }

    await PropertyRateCard.destroy({
      where: { propertyId, roomType },
      transaction: t
    });

    await t.commit();
    res.status(200).json({ message: "Room type deleted successfully." });

  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ message: "Failed to delete room type." });
  }
};
