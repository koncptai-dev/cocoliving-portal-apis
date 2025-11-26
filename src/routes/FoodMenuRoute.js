const FoodMenuController = require('../controllers/FoodMenuController');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

//add food menu by admin
// router.post('/add', authMiddleware, FoodMenuController.createFoodMenu);
// router.put('/edit/:id', authMiddleware, FoodMenuController.editFoodMenu);

router.post('/upsert', authMiddleware, FoodMenuController.upsertFoodMenu);

router.get('/list', authMiddleware, FoodMenuController.getFoodMenus);
router.delete('/delete/:id', authMiddleware, FoodMenuController.deleteFoodMenu);
router.get('/user-menus', authMiddleware, FoodMenuController.getUserMenus);

module.exports = router