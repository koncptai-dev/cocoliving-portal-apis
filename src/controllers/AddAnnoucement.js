const Announcement = require("../models/annoucement");
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// Create Announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, priority, audience, content } = req.body;

    const announcement = await Announcement.create({
      title,
      priority,
      audience,
      content,
      status: "Active",
      created:new Date()
    });

    return res.status(201).json({
      message: "Announcement created successfully",
      announcement,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error creating announcement", error: err.message });
  }
};

exports.getAllAnnouncement=async(req,res)=>{

    try{
      const announcements=await Announcement.findAll();
      return res.status(200).json({
        message: "Announcements retrieved successfully",
        announcements,
      });
    }catch(err){
      return res.status(500).json({ message: "Error retrieving announcements", error: err.message });
    }


}