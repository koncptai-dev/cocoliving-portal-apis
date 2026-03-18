const express = require('express');
const router = express.Router();
const CouponController = require('../controllers/CouponController');
const authMiddleware = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const authorizePage = require("../middleware/authorizePage");

// Note: role 1 = Super Admin, 3 = Manager, etc. Adjust based on your system.
const adminPrivilege = authorizeRole(1, 3);

// POST Create Coupon
router.post('/add', authMiddleware, adminPrivilege,authorizePage("Coupon Management","write"), CouponController.createCoupon);

// GET All Coupons
router.get('/getAll', authMiddleware, adminPrivilege,authorizePage("Coupon Management","read"), CouponController.getAllCoupons);

// PUT Update Coupon
router.put('/edit/:couponId', authMiddleware, adminPrivilege,authorizePage("Coupon Management","write"), CouponController.updateCoupon);

// PATCH Toggle Status
router.patch('/:id/toggle-status', authMiddleware, adminPrivilege,authorizePage("Coupon Management","write"), CouponController.toggleStatus);

// PATCH Disable Coupon
router.patch('/:id/disable', authMiddleware, adminPrivilege,authorizePage("Coupon Management","write"), CouponController.disableCoupon);

// POST Share Coupon
router.post('/:id/share', authMiddleware, adminPrivilege,authorizePage("Coupon Management","write"), CouponController.shareCoupon);

// POST Validate Coupon (Accessible to all authenticated users)
router.post('/validate', authMiddleware, authorizeRole(1, 2, 3), CouponController.validateCoupon);

module.exports = router;
