const Coupon = require('../models/coupon');
const Property = require('../models/property');
const User = require('../models/user');
const ScheduledVisit = require('../models/scheduledVisit');
const { Booking, Rooms } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { logApiCall } = require('../helpers/auditLog');
const { mailsender } = require('../utils/emailService');
const emailTemplates = require('../utils/emailTemplates/emailTemplates');

// Create Coupon
exports.createCoupon = async (req, res) => {
    try {
        const { title, code, discountType, discountValue, startDate, endDate, status } = req.body;

        // Duplicate code check
        const existingCoupon = await Coupon.findOne({ where: { code } });
        if (existingCoupon) {
            await logApiCall(req, res, 400, "Created coupon - duplicate code", "coupon");
            return res.status(400).json({ message: "A coupon with this code already exists." });
        }

        const coupon = await Coupon.create({
            title,
            code,
            discountType,
            discountValue,
            startDate,
            endDate,
            status: status || 'Active',
            shareTarget: 'Not Shared'
        });

        await logApiCall(req, res, 201, `Created new coupon: ${title} (Code: ${code})`, "coupon", coupon.id);
        return res.status(201).json({
            message: "Coupon created successfully",
            coupon
        });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while creating coupon", "coupon");
        return res.status(500).json({ message: "Error creating coupon", error: err.message });
    }
};

// Edit Coupon
exports.updateCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;
        const { title, code, discountType, discountValue, startDate, endDate } = req.body;

        const coupon = await Coupon.findByPk(couponId);
        if (!coupon) {
            await logApiCall(req, res, 404, `Edited coupon - not found (ID: ${couponId})`, "coupon", parseInt(couponId));
            return res.status(404).json({ message: "Coupon not found" });
        }

        if (coupon.isDisabled) {
            await logApiCall(req, res, 400, `Edited coupon - disabled (ID: ${couponId})`, "coupon", parseInt(couponId));
            return res.status(400).json({ message: "Cannot edit a permanently disabled coupon" });
        }

        if (coupon.shareTarget !== 'Not Shared') {
            await logApiCall(req, res, 400, `Edited coupon - already shared (ID: ${couponId})`, "coupon", parseInt(couponId));
            return res.status(400).json({ message: "Cannot edit a coupon that has already been shared" });
        }

        // Duplicate code check if code is changed
        if (code && code !== coupon.code) {
            const existingCoupon = await Coupon.findOne({ where: { code } });
            if (existingCoupon) {
                await logApiCall(req, res, 400, `Edited coupon - duplicate code (ID: ${couponId})`, "coupon", parseInt(couponId));
                return res.status(400).json({ message: "Another coupon with this code already exists." });
            }
        }

        await coupon.update({
            title: title || coupon.title,
            code: code || coupon.code,
            discountType: discountType || coupon.discountType,
            discountValue: discountValue || coupon.discountValue,
            startDate: startDate || coupon.startDate,
            endDate: endDate || coupon.endDate
        });

        await logApiCall(req, res, 200, `Updated coupon: ${coupon.title} (ID: ${couponId})`, "coupon", parseInt(couponId));
        return res.status(200).json({ message: "Coupon updated successfully", coupon });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while updating coupon", "coupon", parseInt(req.params.couponId) || 0);
        return res.status(500).json({ message: "Error updating coupon", error: err.message });
    }
};

// Toggle Status (Active/Inactive)
exports.toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByPk(id);

        if (!coupon) {
            await logApiCall(req, res, 404, `Toggled coupon status - not found (ID: ${id})`, "coupon", parseInt(id));
            return res.status(404).json({ message: "Coupon not found" });
        }

        if (coupon.isDisabled) {
            await logApiCall(req, res, 400, `Toggled coupon status - disabled (ID: ${id})`, "coupon", parseInt(id));
            return res.status(400).json({ message: "Cannot toggle a permanently disabled coupon" });
        }

        coupon.status = coupon.status === 'Active' ? 'Inactive' : 'Active';
        await coupon.save();

        await logApiCall(req, res, 200, `Toggled coupon status to ${coupon.status} (ID: ${id})`, "coupon", parseInt(id));
        return res.json({ message: 'Coupon status updated', coupon });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while toggling coupon status", "coupon", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: "Error updating coupon status", error: err.message });
    }
};

// Disable Coupon (Explicitly set to Inactive)
exports.disableCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByPk(id);

        if (!coupon) {
            await logApiCall(req, res, 404, `Disabled coupon - not found (ID: ${id})`, "coupon", parseInt(id));
            return res.status(404).json({ message: "Coupon not found" });
        }

        coupon.status = 'Inactive';
        coupon.isDisabled = true;
        await coupon.save();

        await logApiCall(req, res, 200, `Disabled coupon (ID: ${id})`, "coupon", parseInt(id));
        return res.json({ message: 'Coupon disabled successfully', coupon });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while disabling coupon", "coupon", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: "Error disabling coupon", error: err.message });
    }
};

// Get All Coupons
exports.getAllCoupons = async (req, res) => {
    try {
        // Also support search code functionality
        const { code } = req.query;
        let whereClause = {};
        if (code) {
            whereClause.code = code;
        }

        const coupons = await Coupon.findAll({
            where: whereClause,
            include: [{
                model: Property,
                as: 'property',
                attributes: ['id', 'name']
            }],
            order: [['createdAt', 'DESC']]
        });

        // Auto-disable past due coupons silently
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let coupon of coupons) {
            if (!coupon.isDisabled && coupon.endDate) {
                const endDate = new Date(coupon.endDate);
                endDate.setHours(0, 0, 0, 0);
                if (today.getTime() > endDate.getTime()) {
                    coupon.isDisabled = true;
                    coupon.status = 'Inactive';
                    await coupon.save();
                }
            }
        }

        await logApiCall(req, res, 200, "Viewed all coupons list", "coupon");
        return res.status(200).json({
            message: "Coupons retrieved successfully",
            coupons
        });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while retrieving coupons", "coupon");
        return res.status(500).json({ message: "Error retrieving coupons", error: err.message });
    }
};

// Share Coupon API
exports.shareCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { shareTarget, propertyId } = req.body;

        const coupon = await Coupon.findByPk(id);

        if (!coupon) {
            await logApiCall(req, res, 404, `Shared coupon - not found (ID: ${id})`, "coupon", parseInt(id));
            return res.status(404).json({ message: "Coupon not found" });
        }

        if (coupon.isDisabled) {
            await logApiCall(req, res, 400, `Shared coupon - disabled (ID: ${id})`, "coupon", parseInt(id));
            return res.status(400).json({ message: "Cannot share a permanently disabled coupon" });
        }

        if (coupon.status !== 'Active') {
            await logApiCall(req, res, 400, `Shared coupon - not active (ID: ${id})`, "coupon", parseInt(id));
            return res.status(400).json({ message: "Only active coupons can be shared" });
        }

        if (coupon.shareTarget !== 'Not Shared') {
            await logApiCall(req, res, 400, `Shared coupon - already shared (ID: ${id})`, "coupon", parseInt(id));
            return res.status(400).json({ message: "Coupon has already been shared" });
        }

        if (shareTarget === 'Specific Property' && !propertyId) {
            await logApiCall(req, res, 400, `Shared coupon - missing property (ID: ${id})`, "coupon", parseInt(id));
            return res.status(400).json({ message: "Property ID is required for property-specific sharing" });
        }

        // Fetch users to email
        let usersToEmail = [];
        if (shareTarget === 'All Users') {
            usersToEmail = await User.findAll({
                where: { status: 1, role: 2 }, // Active regular users
                attributes: ['email', 'fullName']
            });
        } else if (shareTarget === 'Specific Property') {
            // 1. Fetch users without bookings and not super-admin using Raw Query
            const [unbookedUsers] = await sequelize.query(`
                SELECT u.id, u."fullName", u.email
                FROM users u
                LEFT JOIN bookings b ON u.id = b."userId"
                WHERE b.id IS NULL
                AND u."userType" != 'super-admin'
            `);

            // 2. Fetch users from scheduled_visits
            const visits = await ScheduledVisit.findAll({
                attributes: ['email', 'name']
            });

            // Combine and deduplicate
            const uniqueEmails = new Map();

            unbookedUsers.forEach(u => {
                if (u.email) uniqueEmails.set(u.email, { email: u.email, fullName: u.fullName });
            });

            visits.forEach(v => {
                if (v.email) uniqueEmails.set(v.email, { email: v.email, fullName: v.name });
            });

            usersToEmail = Array.from(uniqueEmails.values());
        } else {
            return res.status(400).json({ message: "Invalid share target" });
        }

        // Update Coupon DB record
        coupon.shareTarget = shareTarget;
        if (shareTarget === 'Specific Property') {
            coupon.propertyId = propertyId;
        }
        await coupon.save();

        // Fetch Property Name for email if applicable
        let propertyName = null;
        if (shareTarget === 'Specific Property' && propertyId) {
            const property = await Property.findByPk(propertyId);
            if (property) {
                propertyName = property.name;
            }
        }

        // Fire & Forget Emails (Don't hold up the request waiting for thousands of emails)
        const sendEmailsAsync = async () => {
            for (const u of usersToEmail) {
                if (u.email && emailTemplates.couponShareEmail) {
                    try {
                        const mail = emailTemplates.couponShareEmail({
                            title: coupon.title,
                            code: coupon.code,
                            discountValue: coupon.discountValue,
                            discountType: coupon.discountType,
                            endDate: coupon.endDate,
                            propertyName: propertyName
                        });
                        await mailsender(u.email, `Special Offer: ${coupon.title}`, mail.html, mail.attachments);
                    } catch (e) {
                        console.error(`Failed sending share email to ${u.email}:`, e);
                    }
                }
            }
        };
        sendEmailsAsync();

        await logApiCall(req, res, 200, `Shared coupon (ID: ${id}) to ${shareTarget}`, "coupon", parseInt(id));
        return res.json({
            message: `Coupon shared successfully with ${usersToEmail.length} user(s)`,
            coupon,
            usersCount: usersToEmail.length
        });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while sharing coupon", "coupon", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: "Error sharing coupon", error: err.message });
    }
};
