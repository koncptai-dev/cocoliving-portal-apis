const FoodMenuController = require('../controllers/FoodMenuController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");
const uploadFoodImages = require('../middleware/foodMenuUpload');
const authorizePage = require("../middleware/authorizePage");

//add food menu by admin
// router.post('/add', authMiddleware, FoodMenuController.createFoodMenu);
// router.put('/edit/:id', authMiddleware, FoodMenuController.editFoodMenu);

// admin
router.post('/upsert', authMiddleware, authorizeRole(1,3), uploadFoodImages, authorizePage("Food Menu", "write"), FoodMenuController.upsertFoodMenu);

// admin
router.get('/list', authMiddleware, authorizeRole(1,3), authorizePage("Food Menu", "read"), FoodMenuController.getFoodMenus);
router.delete('/delete/:id', authMiddleware, authorizeRole(1,3), authorizePage("Food Menu", "write"), FoodMenuController.deleteFoodMenu);
router.put('/delete-image', authMiddleware, authorizeRole(1,3), authorizePage("Food Menu", "write"), FoodMenuController.deleteFoodImage);

// user
router.get('/user-menus', authMiddleware, authorizeRole(2), authorizePage("Food Menu", "read"), FoodMenuController.getUserMenus);

module.exports = router