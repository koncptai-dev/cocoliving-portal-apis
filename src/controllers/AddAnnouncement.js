const Announcement = require("../models/annoucement");
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Property = require('../models/property');
const User = require("../models/user");
const Booking = require("../models/bookRoom");
const Rooms = require("../models/rooms");
const { logApiCall } = require("../helpers/auditLog");


// Create Announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, priority, audience, content, propertyId } = req.body;

    //duplicate check
    const existingAnnouncement = await Announcement.findOne({
      where: {
        title,
        propertyId: propertyId && propertyId !== "all" ? propertyId : null
      }
    })
    if (existingAnnouncement) {
      await logApiCall(req, res, 400, "Created announcement - duplicate title for property", "announcement");
      return res.status(400).json({ message: "Announcement with this title already exists for the property." });
    }
    if (!propertyId || propertyId === "all") {
      await logApiCall(req, res, 400, "Created announcement - property must be selected", "announcement");
      return res.status(400).json({ message: "Property must be selected." });
    }

    const announcement = await Announcement.create({
      title,
      priority,
      audience: audience === "all" ? "all" : audience,
      content,
      created: new Date(),
      propertyId
    });

    await logApiCall(req, res, 201, `Created new announcement: ${title} (ID: ${announcement.id})`, "announcement", announcement.id);
    return res.status(201).json({
      message: "Announcement created successfully",
      announcement,
    });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while creating announcement", "announcement");
    return res.status(500).json({ message: "Error creating announcement", error: err.message });
  }
};


//edit announcement
exports.editAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.params;
    const { title, priority, audience, content } = req.body;

    //check announcement exists
    const announcement = await Announcement.findByPk(announcementId);
    if (!announcement) {
      await logApiCall(req, res, 404, `Edited announcement - announcement not found (ID: ${announcementId})`, "announcement", parseInt(announcementId));
      return res.status(404).json({ message: "Announcement not found" });
    }

    //duplicate check
    const existingAnnouncement = await Announcement.findOne({
      where: {
        title,
        propertyId: announcement.propertyId,
        id: { [Op.ne]: announcementId }
      }
    })
    if (existingAnnouncement) {
      await logApiCall(req, res, 400, `Edited announcement - duplicate title (ID: ${announcementId})`, "announcement", parseInt(announcementId));
      return res.status(400).json({ message: "Another announcement with this title already exists for the property." });
    }

    await announcement.update({
      title: title || announcement.title,
      priority: priority || announcement.priority,
      audience: audience || announcement.audience,
      content: content || announcement.content
    })
    await logApiCall(req, res, 200, `Updated announcement: ${announcement.title} (ID: ${announcementId})`, "announcement", parseInt(announcementId));
    return res.status(200).json({ message: "Announcement updated successfully", announcement });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while updating announcement", "announcement", parseInt(req.params.announcementId) || 0);
    return res.status(500).json({ message: "Error updating announcement", error: err.message });
  }
}

exports.getAllAnnouncement = async (req, res) => {
  try {

    const announcements = await Announcement.findAll({
      include: [{
        model: Property, as: "property", attributes: ['id', 'name']
      }]
    });
    await logApiCall(req, res, 200, "Viewed all announcements list", "announcement");
    return res.status(200).json({
      message: "Announcements retrieved successfully",
      announcements,
    });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while retrieving announcements", "announcement");
    return res.status(500).json({ message: "Error retrieving announcements", error: err.message });
  }
}

//get distinct usertypes from announcement
exports.getAllUserTypes = async (req, res) => {
  try {
    const userTypes = await User.findAll({
      attributes: [[sequelize.fn("DISTINCT", sequelize.col("userType")), "userType"]],
      where: { userType: { [Op.ne]: "super-admin" } } // exclude admin
    });
    await logApiCall(req, res, 200, "Viewed all user types", "announcement");
    res.json(userTypes.map(u => u.userType));
  } catch (error) {
    console.error(error);
    await logApiCall(req, res, 500, "Error occurred while fetching user types", "announcement");
    res.status(500).json({ message: "Failed to fetch user types" });
  }
};

//delete announcement
exports.deleteAnnouncement = async (req, res) => {
  const { announcementId } = req.params
  try {
    const announcement = await Announcement.findByPk(announcementId);
    if (!announcement) {
      await logApiCall(req, res, 404, `Deleted announcement - announcement not found (ID: ${announcementId})`, "announcement", parseInt(announcementId));
      return res.status(404).json({ message: "Announcement not found" });
    }

    await announcement.destroy();
    await logApiCall(req, res, 200, `Deleted announcement: ${announcement.title} (ID: ${announcementId})`, "announcement", parseInt(announcementId));
    return res.status(200).json({ message: "Announcement deleted successfully" });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while deleting announcement", "announcement", parseInt(req.params.announcementId) || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
}

//change status using toggle
exports.toggleEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      await logApiCall(req, res, 404, `Toggled announcement status - announcement not found (ID: ${id})`, "announcement", parseInt(id));
      return res.status(404).json({ message: "Announcement not found" });
    }

    // Toggle the is_active field
    announcement.is_active = !announcement.is_active;
    await announcement.save();

    await logApiCall(req, res, 200, `Toggled announcement status to ${announcement.is_active ? 'active' : 'inactive'} (ID: ${id})`, "announcement", parseInt(id));
    return res.json({ message: 'Announcement Status Is updated', announcement });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while toggling announcement status", "announcement", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
};

//user side Announcements
exports.getAnnouncement = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    //finding user,booking,property
    const user = await User.findByPk(userId, {
      include: [{
        model: Booking, as: 'bookings', include: [{
          model: Rooms, as: "room", include: [{ model: Property, as: "property" }]
        }]
      }]
    })

    if (!user) {
      await logApiCall(req, res, 404, "Viewed announcements - user not found", "announcement", userId);
      return res.status(404).json({ message: "User not found" })
    }

    const propertyIds = (user.bookings || []).map(b => b.room?.propertyId).filter(Boolean);

    //fetch announcements for property
    const { rows: announcements, count } = await Announcement.findAndCountAll({
      where: {
        is_active: true,
        propertyId: propertyIds, // user’s property only
        [Op.or]: [
          { audience: "all" },          // for everyone
          { audience: user.userType }   // specific user type
        ]
      },
      include: [
        { model: Property, as: "property", attributes: ["id", "name"] }
      ],
      limit,
      offset, order: [['createdAt', 'DESC']]
    })

    const formatted = announcements.map(a => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      audience: a.audience,
      content: a.content,
      created: a.created,
      property: a.property ? { id: a.property.id, name: a.property.name } : null
    }));
    const totalPages = Math.ceil(count / limit);
    await logApiCall(req, res, 200, "Viewed user announcements", "announcement", userId);
    return res.status(200).json({ message: "Announcements retrieved successfully", announcements: formatted, currentPage: page, totalPages, totalAnnouncements: count });
  } catch (err) {
    console.error("getAnnouncements error:", err);
    await logApiCall(req, res, 500, "Error occurred while fetching user announcements", "announcement", req.user?.id || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
}