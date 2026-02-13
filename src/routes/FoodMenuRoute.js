const FoodMenuController = require('../controllers/FoodMenuController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");

//add food menu by admin
// router.post('/add', authMiddleware, FoodMenuController.createFoodMenu);
// router.put('/edit/:id', authMiddleware, FoodMenuController.editFoodMenu);

// admin
router.post('/upsert', authMiddleware, authorizeRole(1,3), FoodMenuController.upsertFoodMenu);

// admin
router.get('/list', authMiddleware, authorizeRole(1,3), FoodMenuController.getFoodMenus);
router.delete('/delete/:id', authMiddleware, authorizeRole(1,3), FoodMenuController.deleteFoodMenu);

// user
router.get('/user-menus', authMiddleware, authorizeRole(2), FoodMenuController.getUserMenus);

module.exports = router