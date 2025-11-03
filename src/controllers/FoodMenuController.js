const sequelize = require('../config/database');
const { Op, json } = require('sequelize');
const FoodMenu = require('../models/foodMenu');
const Property = require('../models/property');
const Booking = require('../models/bookRoom');
const Room = require('../models/rooms');

exports.createFoodMenu = async (req, res) => {
  try {
    let {propertyId, date,breakfast_items, lunch_items, dinner_items } = req.body;

    //check property exist or not
        const property = await Property.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ message: "Property not found" });
        }

    if (!date || !breakfast_items || !lunch_items || !dinner_items) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const formattedDate = new Date(date).toISOString().split("T")[0];

    // Check if menu already exists for this date + mealType
    const existing = await FoodMenu.findOne({
      where: { propertyId,date: formattedDate },
    });    

    if (existing) {
      return res.status(400).json({
        message: `Menu already exists for ${formattedDate}.`,
      });
    }
    // Create new menu
    const menu = await FoodMenu.create({
      propertyId,
      date:formattedDate,
      breakfast_items,
      lunch_items,
      dinner_items
    });

    res.status(201).json({ message: "Food menu created successfully", menu });
  } catch (error) {
    console.error("Error creating food menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

exports.getFoodMenus = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

    const { rows: menus, count } = await FoodMenu.findAndCountAll({
      include: [{ model: Property,as: 'property', attributes: ['id', 'name'] }],
      order: [['date', 'ASC']],
      limit,
      offset
    });

    const totalPages=Math.ceil(count / limit);

    res.status(200).json({ menus,currentPage: page,totalPages });
  } catch (error) {
    console.error("Error fetching food menus:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.editFoodMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const {breakfast_items, lunch_items, dinner_items } = req.body;

    if (!breakfast_items || !lunch_items || !dinner_items) {
      return res.status(400).json({ message: "Missing required menu items for update (breakfast_items, lunch_items, dinner_items)" });
    }

    const menu = await FoodMenu.findByPk(id);

    if (!menu) {
      return res.status(404).json({ message: `Food menu not found.` });
    }

    await menu.update({
      breakfast_items,
      lunch_items,
      dinner_items,
    });

    res.status(200).json({ message: "Food menu updated successfully", menu });

  } catch (error) {
    console.error("Error editing food menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

exports.deleteFoodMenu = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await FoodMenu.findByPk(id);

    if (!menu) {
      return res.status(404).json({ message: `Food menu not found.` });
    }

    // Delete the menu entry
    await menu.destroy();

    res.status(200).json({ message: "Food menu deleted successfully" });

  } catch (error) {
    console.error("Error deleting food menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

//for user 

exports.getUserMenus = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT token


    const bookings = await Booking.findAll({
      where: {
        userId,
        status: { [Op.or]: ["approved", "active"] },
      },
      include: {
        model: Room,
        as: "room",
        include: { model: Property, as: "property" },
      },
    
    });

    if (!bookings.length) {
      return res.status(404).json({
        message: "No active bookings or properties found for this user",
      });
    }

    // extract all unique property IDs from user's bookings
    const propertyIds = [
      ...new Set(bookings.map(b => b.room?.property?.id).filter(Boolean)),
    ];

    if (!propertyIds.length) {
      return res.status(404).json({ message: "No valid property IDs found" });
    }

    // get today's and tomorrow's menus for those properties
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split("T")[0];
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const menus = await FoodMenu.findAll({
      where: {
        propertyId: { [Op.in]: propertyIds },
        date: { [Op.in]: [todayStr, tomorrowStr] },
      },
      include: [
        {
          model: Property,
          as: "property",
          attributes: ["id", "name"],
        },
      ],
      order: [["date", "ASC"]],
    });

    return res.json({ propertyIds, menus });
  } catch (error) {
    console.error("Error fetching user menus:", error);
    return res.status(500).json({ message: "Failed to fetch user menus" });
  }
};
