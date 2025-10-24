const FoodMenuController = require('../controllers/FoodMenuController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

//add food menu by admin
router.post('/add', authMiddleware, FoodMenuController.createFoodMenu);
router.put('/edit/:id', authMiddleware, FoodMenuController.editFoodMenu);
router.get('/list', authMiddleware, FoodMenuController.getFoodMenus);
router.delete('/delete/:id', authMiddleware, FoodMenuController.deleteFoodMenu);

module.exports = router