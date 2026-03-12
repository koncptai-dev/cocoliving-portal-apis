const express = require('express');
const router = express.Router();
const CouponController = require('../controllers/CouponController');
const authMiddleware = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

// Note: role 1 = Super Admin, 3 = Manager, etc. Adjust based on your system.
const adminPrivilege = authorizeRole(1, 3);

// POST Create Coupon
router.post('/add', authMiddleware, adminPrivilege, CouponController.createCoupon);

// GET All Coupons
router.get('/getAll', authMiddleware, adminPrivilege, CouponController.getAllCoupons);

// PUT Update Coupon
router.put('/edit/:couponId', authMiddleware, adminPrivilege, CouponController.updateCoupon);

// PATCH Toggle Status
router.patch('/:id/toggle-status', authMiddleware, adminPrivilege, CouponController.toggleStatus);

// PATCH Disable Coupon
router.patch('/:id/disable', authMiddleware, adminPrivilege, CouponController.disableCoupon);

// POST Share Coupon
router.post('/:id/share', authMiddleware, adminPrivilege, CouponController.shareCoupon);

module.exports = router;
