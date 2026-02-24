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
const { logApiCall } = require("../helpers/auditLog");
const UserPermission = require('../models/userPermissoin');
const PropertyFloorLayout = require("../models/floorLayout");

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
    const { name, address, description, amenities, is_active, rateCard, floorLayout } = req.body;

    // Check if property already exists
    const existing = await Property.findOne({ where: { name, address }, transaction: t });
    if (existing) {
      deleteFiles(req.files || []);
      await t.rollback();
      await logApiCall(req, res, 400, `Created property - property already exists (${name})`, "property");
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
      await logApiCall(req, res, 400, "Created property - too many images (max 20)", "property");
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
          const safeRoomType = rc.roomType.replace(/\s+/g, "_");
          const roomImages = req.files?.filter(f => f.fieldname === `roomImages_${safeRoomType}`) || [];
          const roomImageUrls = roomImages.map(f => `/uploads/roomImages/${f.filename}`);

          if (roomImageUrls.length > 10) {
            deleteFiles([...propertyFiles, ...roomImages]);
            await t.rollback();
            await logApiCall(req, res, 400, `Created property - too many room images for ${rc.roomType} (max 10)`, "property");
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

    // // Handle Floor Layout
    if (floorLayout) {
      const floorArray = typeof floorLayout === "string" ? JSON.parse(floorLayout) : floorLayout;

      if (Array.isArray(floorArray) && floorArray.length > 0) {
        const floorsToCreate = [];

        for (const floor of floorArray) {
          if (!floor.floorNumber) {
            deleteFiles(req.files || []);
            await t.rollback();
            return res.status(400).json({
              message: "Floor number is required"
            });
          }
          const floorImages = req.files?.filter(
            f => f.fieldname === `floorImages_${floor.floorNumber}`
          ) || [];

          const floorImageUrls = floorImages.map(
            f => `/uploads/floorImages/${f.filename}`
          );

          if (floorImageUrls.length > 10) {
            deleteFiles(req.files || []);
            await t.rollback();
            return res.status(400).json({
              message: `Maximum 10 images allowed for floor ${floor.floorName}`
            });
          }

          floorsToCreate.push({
            propertyId: property.id,
            floorNumber: floor.floorNumber || null,
            floorImages: floorImageUrls
          });
        }

        await PropertyFloorLayout.bulkCreate(floorsToCreate, { transaction: t });
      }
    }

    //admin created property added to permission
    const permission = await UserPermission.findOne({
      where: { userId: req.user.id },
      transaction: t
    });

    if (permission) {
      let updatedProps = permission.properties ? [...permission.properties] : [];

      // push as NUMBER not string
      updatedProps.push(Number(property.id));

      // remove duplicates
      updatedProps = [...new Set(updatedProps)];

      console.log("BEFORE UPDATE =>", permission.properties);
      console.log("UPDATED PROPERTIES ====>", updatedProps);


      //update permission
      await permission.update({ properties: updatedProps }, { transaction: t });
      console.log("UPDATED PROPERTIES ====> ", updatedProps);
      const refreshed = await UserPermission.findOne({ where: { userId: req.user.id }, transaction: t });
      console.log("REFRESHED ROW =>", refreshed.properties);

    }

    await t.commit();
    await logApiCall(req, res, 201, `Created new property: ${name} (ID: ${property.id})`, "property", property.id);
    res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    deleteFiles(req.files || []);
    await t.rollback();
    console.error(error);
    await logApiCall(req, res, 500, "Error occurred while creating property", "property");
    res.status(500).json({ message: "Failed to create property" });
  }
};

exports.editProperties = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    let { name, address, description, images, amenities, is_active, removedImages, rateCard } = req.body;

    const property = await Property.findByPk(id, { transaction: t });
    if (!property) {
      await t.rollback();
      await logApiCall(req, res, 404, `Updated property - property not found (ID: ${id})`, "property", parseInt(id));
      return res.status(404).json({ message: "Property not found" });
    }

    // Check duplicate name
    if (name) {
      const existing = await Property.findOne({
        where: { name, id: { [Op.ne]: id } }, transaction: t
      });
      if (existing) {
        await t.rollback();
        await logApiCall(req, res, 400, `Updated property - property with same name already exists (ID: ${id})`, "property", parseInt(id));
        return res.status(400).json({ message: "Property with same name already exists" });
      }
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
      await logApiCall(req, res, 400, `Updated property - too many images (max 20) (ID: ${id})`, "property", parseInt(id));
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
            let updatedRoomImages = Array.isArray(existingRC.roomImages) ? [...existingRC.roomImages] : [];
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
            const safeRoomType = rc.roomType.replace(/\s+/g, "_");
            const roomFiles = req.files?.filter(f => f.fieldname === `roomImages_${safeRoomType}`) || [];
            const newRoomImages = roomFiles.map(f => `/uploads/roomImages/${f.filename}`);

            // Check max 10 images per room
            if (updatedRoomImages.length + newRoomImages.length > 10) {
              await t.rollback();

              // Delete newly uploaded files to prevent orphan files
              roomFiles.forEach(f => {
                const filePath = path.join(__dirname, '..', 'uploads/roomImages', f.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              });
              await logApiCall(req, res, 400, `Updated property - too many room images for ${rc.roomType} (ID: ${id})`, "property", parseInt(id));
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
            await logApiCall(req, res, 400, `Updated property - too many images for new room type ${rc.roomType} (ID: ${id})`, "property", parseInt(id));
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

    //floor layout
    if (req.body.floorLayout) {
      const floorArray =
        typeof req.body.floorLayout === "string"
          ? JSON.parse(req.body.floorLayout)
          : req.body.floorLayout;

      for (const floor of floorArray) {

        if (!floor.floorNumber) {
          await t.rollback();
          return res.status(400).json({ message: "Floor number is required" });
        }

        let existingFloor = null;

        if (floor.id) {
          //  find by ID first
          existingFloor = await PropertyFloorLayout.findByPk(floor.id, { transaction: t });
        } else {
          // For new floors, check by floorNumber to prevent duplicates
          existingFloor = await PropertyFloorLayout.findOne({
            where: {
              propertyId: property.id,
              floorNumber: floor.floorNumber
            },
            transaction: t
          });
        }
        // update existing floor
        if (existingFloor) {

          let removedFloorImages = Array.isArray(floor.removedFloorImages)
            ? floor.removedFloorImages
            : [];

          let updatedFloorImages = Array.isArray(existingFloor.floorImages)
            ? [...existingFloor.floorImages]
            : [];

          // Remove deleted images from DB array
          updatedFloorImages = updatedFloorImages.filter(
            img => !removedFloorImages.includes(img)
          );

          // Delete removed images from folder
          for (const imgUrl of removedFloorImages) {
            try {
              const filePath = path.join(__dirname, "..", imgUrl.replace(/^\//, ""));
              if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
            } catch (err) {
              console.error("Failed to delete floor image:", err);
            }
          }

          // Add new uploaded images
          const floorFiles =
            req.files?.filter(
              f => f.fieldname === `floorImages_${floor.floorNumber}`
            ) || [];

          const newFloorImages = floorFiles.map(
            f => `/uploads/floorImages/${f.filename}`
          );

          // Max 10 check
          if (updatedFloorImages.length + newFloorImages.length > 10) {
            await t.rollback();

            floorFiles.forEach(f => {
              const filePath = path.join(
                __dirname,
                "..",
                "uploads/floorImages",
                f.filename
              );
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });

            return res.status(400).json({
              message: `Max 10 images allowed for floor ${floor.floorNumber}`
            });
          }

          updatedFloorImages = [...updatedFloorImages, ...newFloorImages];

          await existingFloor.update(
            {
              floorNumber: floor.floorNumber,
              floorImages: updatedFloorImages
            },
            { transaction: t }
          );

        }
        // create new floor if not exist
        else {

          const floorFiles =
            req.files?.filter(
              f => f.fieldname === `floorImages_${floor.floorNumber}`
            ) || [];

          const floorImageUrls = floorFiles.map(
            f => `/uploads/floorImages/${f.filename}`
          );

          if (floorImageUrls.length > 10) {
            await t.rollback();

            floorFiles.forEach(f => {
              const filePath = path.join(
                __dirname,
                "..",
                "uploads/floorImages",
                f.filename
              );
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });

            return res.status(400).json({
              message: `Max 10 images allowed for floor ${floor.floorNumber}`
            });
          }

          await PropertyFloorLayout.create(
            {
              propertyId: property.id,
              floorNumber: floor.floorNumber,
              floorImages: floorImageUrls
            },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
    await logApiCall(req, res, 200, `Updated property: ${property.name} (ID: ${id})`, "property", parseInt(id));
    res.status(200).json({ message: "Property updated successfully", property });

  } catch (err) {
    await t.rollback();
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while updating property", "property", parseInt(req.params.id) || 0);
    res.status(500).json({ message: "Failed to update property" });
  }
};

//for admin and superadmin viewing properties
exports.getProperties = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const queryOptions = {
      order: [["createdAt", "DESC"]],
      include: [{ model: PropertyRateCard, as: "rateCard" }, { model: PropertyFloorLayout, as: "floorLayout" }],
      distinct: true,
      col: 'id',
      limit,
      offset
    };

    if (req.user.role === 3) { // admin
      const userPermissions = await UserPermission.findOne({
        where: { userId: req.user.id }
      });
      const accessibleProperties = userPermissions?.properties || [];

      // If admin has no properties, return empty
      if (accessibleProperties.length === 0) {
        return res.json({ properties: [], currentPage: page, totalPages: 0 });
      }
      queryOptions.where = { id: { [Op.in]: accessibleProperties } }; // only show allowed properties 
    }
    const { rows: properties, count } = await Property.findAndCountAll(queryOptions);
    const totalPages = Math.ceil(count / limit);

    // Log API call
    await logApiCall(req, res, 200, "Viewed properties list", "property");

    res.json({ properties, currentPage: page, totalPages });

  } catch (error) {
    console.log(error);

    await logApiCall(req, res, 500, "Error occurred while fetching properties", "property");
    res.status(500).json({ message: "Failed to fetch properties" });
  }
};

//for user
exports.getPropertiesForUser = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Fetch all properties with rate cards
    const { rows: properties, count } = await Property.findAndCountAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: PropertyRateCard, as: "rateCard" }, { model: PropertyFloorLayout, as: "floorLayout" }],
      limit,
      offset
    });

    // Filter and update properties to include availability info
    const updatedProperties = await Promise.all(properties.map(async (p) => {
      const updatedRateCards = await Promise.all(p.rateCard.map(async (rc) => {
        // Fetch rooms for this property + roomType
        const rooms = await Rooms.findAll({
          where: { propertyId: p.id, roomType: rc.roomType },
          include: [{
            model: Booking,
            as: "bookings",
            where: { status: { [Op.in]: ["pending", "approved", "active"] } },
            required: false
          }]
        });

        // Filter available rooms
        const availableRooms = rooms.filter(r => r.status === "available" && (r.capacity - (r.bookings?.length || 0) > 0));

        return {
          ...rc.dataValues,
          totalRooms: rooms.length,
          availableRooms: availableRooms.length,
          isAvailable: rooms.length > 0 && availableRooms.length > 0
        };
      }));

      // Only keep rate cards that have available rooms
      const filteredRateCards = updatedRateCards.filter(rc => rc.isAvailable);

      // Skip property if no rate cards are available
      if (filteredRateCards.length === 0) return null;

      return {
        ...p.dataValues,
        rateCard: filteredRateCards
      };
    }));

    // Remove null properties (no available rooms)
    const propertiesForUser = updatedProperties.filter(p => p !== null);

    const totalPages = Math.ceil(count / limit);

    // Log API call
    await logApiCall(req, res, 200, "Viewed properties for user", "property");

    res.json({
      properties: propertiesForUser,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error(error);
    await logApiCall(req, res, 500, "Error fetching properties for user", "property");
    res.status(500).json({ message: "Failed to fetch properties for user" });
  }
};


exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date();

    const property = await Property.findByPk(id, {
      include: [
        { model: PropertyFloorLayout, as: "floorLayout" },
        { model: PropertyRateCard, as: "rateCard" }
      ]
    });

    if (!property) {
      await logApiCall(req, res, 404, `Deleted property - property not found (ID: ${id})`, "property", parseInt(id));
      return res.status(404).json({ message: "Property not found" });
    }

    for (const rc of property.rateCard || []) {
      const hasBooking = await Booking.findOne({
        where: {
          propertyId: id,
          roomType: rc.roomType,
          status: { [Op.in]: ["approved", "pending"] },
          checkOutDate: { [Op.gte]: today }
        }
      });

      if (hasBooking) {
        return res.status(400).json({
          message: `Cannot delete property: Room type "${rc.roomType}" has active or future bookings.`
        });
      }
    }

    // --- Delete property and room images from server ---
    const propertyImages = property.images || []; // if Property has images column
    const floorImages = (property.floorLayout || []).flatMap(f => f.floorImages || []);
    const roomImages = (property.rateCard || []).flatMap(rc => rc.roomImages || []);
    const allImages = [...propertyImages, ...floorImages, ...roomImages];

    for (const imgPath of allImages) {
      const fullPath = path.join(__dirname, '..', imgPath.replace(/^\//, ''));
      if (fs.existsSync(fullPath)) {
        fs.unlink(fullPath, err => {
          if (err) console.error(`Failed to delete file ${fullPath}:`, err);
        });
      }
    }

    // Delete rate cards
    if (property.rateCard && property.rateCard.length > 0) {
      await PropertyRateCard.destroy({ where: { propertyId: id } });
    }

    // Delete floor layouts
    if (property.floorLayout && property.floorLayout.length > 0) {
      await PropertyFloorLayout.destroy({ where: { propertyId: id } });
    }

    await property.destroy();

    await logApiCall(req, res, 200, `Deleted property: ${property.name} (ID: ${id})`, "property", parseInt(id));
    res.status(200).json({ message: "Property deleted successfully" });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while deleting property", "property", parseInt(req.params.id) || 0);
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
      await logApiCall(req, res, 400, `Deleted rate card - has active bookings (Property ID: ${propertyId}, Room Type: ${roomType})`, "property");
      return res.status(400).json({ message: `Cannot delete: Room type "${roomType}" has active or future bookings.` });
    }

    const rateCardToDelete = await PropertyRateCard.findOne({
      where: { propertyId, roomType },
      transaction: t
    });

    if (!rateCardToDelete) {
      await t.rollback();
      await logApiCall(req, res, 404, `Deleted rate card - rate card not found (Property ID: ${propertyId}, Room Type: ${roomType})`, "property");
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
    await logApiCall(req, res, 200, `Deleted rate card: ${roomType} (Property ID: ${propertyId})`, "property", propertyId);
    res.status(200).json({ message: "Room type deleted successfully." });

  } catch (err) {
    await t.rollback();
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while deleting rate card", "property");
    res.status(500).json({ message: "Failed to delete room type." });
  }
};

exports.deleteFloorLayout = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { propertyId, floorNumber } = req.body;

    // Find the floor layout
    const floor = await PropertyFloorLayout.findOne({
      where: { propertyId, floorNumber },
      transaction: t
    });

    if (!floor) {
      await t.rollback();
      await logApiCall(req, res, 404, `Deleted floor layout - floor not found (Property ID: ${propertyId}, Floor: ${floorNumber})`, "property");
      return res.status(404).json({ message: "Floor layout not found." });
    }

    // delete floor images from filesystem
    if (floor.floorImages && floor.floorImages.length > 0) {
      for (const imgUrl of floor.floorImages) {
        try {
          const filePath = path.join(__dirname, '..', imgUrl.replace(/^\//, ''));
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete floor image ${imgUrl}:`, err);
        }
      }
    }

    // delete floorlayout from db
    await PropertyFloorLayout.destroy({
      where: { propertyId, floorNumber },
      transaction: t
    });

    await t.commit();
    await logApiCall(req, res, 200, `Deleted floor layout: Floor ${floorNumber} (Property ID: ${propertyId})`, "property", propertyId);
    res.status(200).json({ message: "Floor layout deleted successfully." });

  } catch (err) {
    await t.rollback();
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while deleting floor layout", "property");
    res.status(500).json({ message: "Failed to delete floor layout." });
  }
};