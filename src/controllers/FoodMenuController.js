const sequelize = require('../config/database');
const { Op, json } = require('sequelize');
const FoodMenu = require('../models/foodMenu');


exports.createFoodMenu = async (req, res) => {
  try {
    let { date, lunch_items, dinner_items } = req.body;

    if (!date || !lunch_items || !dinner_items) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if menu already exists for this date + mealType
    const existing = await FoodMenu.findOne({
      where: { date },
    });

    if (existing) {
      return res.status(400).json({
        message: `Menu already exists for ${date}.`,
      });
    }
    // Create new menu
    const menu = await FoodMenu.create({
      date,
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
    const menus = await FoodMenu.findAll({
      order: [['date', 'ASC']],
    });
    res.status(200).json({ menus });
  } catch (error) {
    console.error("Error fetching food menus:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.editFoodMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { lunch_items, dinner_items } = req.body;

    if (!lunch_items || !dinner_items) {
      return res.status(400).json({ message: "Missing required menu items for update (lunch_items, dinner_items)" });
    }

    const menu = await FoodMenu.findByPk(id);

    if (!menu) {
      return res.status(404).json({ message: `Food menu not found.` });
    }

    await menu.update({
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