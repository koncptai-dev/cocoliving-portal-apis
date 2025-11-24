const sequelize = require('../config/database');
const { Op, json } = require('sequelize');
const FoodMenu = require('../models/foodMenu');
const Property = require('../models/property');
const Booking = require('../models/bookRoom');
const Room = require('../models/rooms');
const PropertyRateCard = require('../models/propertyRateCard');

// exports.createFoodMenu = async (req, res) => {
//   try {
//     const { propertyId, menu } = req.body;

//     if (!menu || !propertyId) {
//       return res.status(400).json({ message: "Property ID & full week menu is required" });
//     }

//     //check property exist or not
//     const property = await Property.findByPk(propertyId);
//     if (!property) {
//       return res.status(404).json({ message: "Property not found" });
//     }

//     // Check if menu already exists for this date + mealType
//     const existing = await FoodMenu.findOne({ where: { propertyId } });
//     if (existing) {
//       return res.status(400).json({
//         message: "Weekly menu already exists for this property",
//       });
//     }

//     // Create new menu
//     const newMenu = await FoodMenu.create({
//       propertyId,
//       menu
//     });

//     res.status(201).json({ message: "Food menu created successfully", newMenu });
//   } catch (error) {
//     console.error("Error creating food menu:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// }

// exports.editFoodMenu = async (req, res) => {
//   try {
//     const { id } = req.params;  
//     const { day, breakfast, lunch, dinner, menu: fullMenu } = req.body;

//     const menu = await FoodMenu.findByPk(id);
//     if (!menu) return res.status(404).json({ message: "Menu not found" });

//     // If full week is sent
//     if (fullMenu) {
//       menu.menu = fullMenu;
//     } 
//     // If single day is sent
//     else if (day && menu.menu[day]) {
//       menu.menu[day] = {
//         breakfast: breakfast || menu.menu[day].breakfast,
//         lunch: lunch || menu.menu[day].lunch,
//         dinner: dinner || menu.menu[day].dinner,
//       };
//     } else {
//       return res.status(400).json({ message: "Invalid weekday or menu data" });
//     }

//     await menu.save();
//     res.status(200).json({ message: `Food Menu updated successfully`, menu });

//   } catch (error) {
//     console.error("Error editing food menu:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };


exports.upsertFoodMenu = async (req, res) => {
  try {
    const { propertyId, menu } = req.body;

    if (!menu || !propertyId) {
      return res.status(400).json({ message: "Property ID & menu are required" });
    }

    // Check if property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Check if menu already exists
    let existingMenu = await FoodMenu.findOne({ where: { propertyId } });

    if (existingMenu) {
      // Update existing menu
      existingMenu.menu = menu;
      await existingMenu.save();
      return res.status(200).json({ message: "Food menu updated successfully", menu: existingMenu });
    } else {
      // Create new menu
      const newMenu = await FoodMenu.create({ propertyId, menu });
      return res.status(201).json({ message: "Food menu created successfully", menu: newMenu });
    }

  } catch (error) {
    console.error("Error upserting food menu:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


exports.getFoodMenus = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows: menus, count } = await FoodMenu.findAndCountAll({
      include: [{ model: Property, as: 'property', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({ menus, currentPage: page, totalPages });
  } catch (error) {
    console.error("Error fetching food menus:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


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
      include: [
        {
          model: PropertyRateCard,
          as: "rateCard",
          include: {
            model: Property,
            as: "property"
          }
        }
      ]

    });

    if (!bookings.length) {
      return res.status(404).json({
        message: "No active bookings or properties found for this user",
      });
    }

    // extract all unique property IDs from user's bookings
    const propertyIds = [
      ...new Set(bookings.map(b => b.rateCard?.property?.id).filter(Boolean)),
    ];

    if (!propertyIds.length) {
      return res.status(404).json({ message: "No valid property IDs found" });
    }

    // get  menus for those properties

    const menus = await FoodMenu.findAll({
      where: {
        propertyId: { [Op.in]: propertyIds },
      },
      include: [
        {
          model: Property,
          as: "property",
          attributes: ["id", "name"],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    if (!menus.length) {
      return res.status(404).json({ message: "No menus found for properties" });
    }

    const finalMenus = menus.map(menu => ({
      propertyId: menu.propertyId,
      propertyName: menu.property?.name,
      weekMenu: menu.menu, // Monday → Sunday
    }));

    return res.json({ menus: finalMenus });
  } catch (error) {
    console.error("Error fetching user menus:", error);
    return res.status(500).json({ message: "Failed to fetch user menus" });
  }
};
