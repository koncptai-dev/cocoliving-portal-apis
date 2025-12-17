const sequelize = require('../config/database');
const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { mailsender } = require('../utils/emailService');
const { Op } = require('sequelize');
const { welcomeEmail } = require('../utils/emailTemplates/emailTemplates');

exports.AddUser = async (req, res) => {
    try {
        const { email, fullName, phone, userType, } = req.body;

        if (!email || !fullName || !phone) {
            return res.status(400).json({ message: "Required fields are missing" });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const newUser = await User.create({
            email,
            fullName,
            phone,
            userType,
            status: 1,
        });
        try {
            const mail = welcomeEmail({firstName:newUser.fullName});
            await mailsender(
                newUser.email,
                'Welcome to Coco Living',
                mail.html,
                mail.attachments
            );
        } catch (err) {
            console.error('Welcome email failed:', err.message);
        }
        res.status(201).json({
            message: `User added successfully.Login email sent to ${email}`,
            user: newUser
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

exports.getAllUser = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        //fetch users with count
        const { rows: users, count } = await User.findAndCountAll({
            where: { userType: { [Op.notIn]: ["super-admin", "admin"] } },
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.json({ users, curretnPage: page, totalPages: Math.ceil(count / limit), totalUsers: count });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch Users" });
    }
}


//create admin user

exports.createAdminUser = async (req, res) => {
    const t = await sequelize.transaction(); //  Start transaction
    try {
        const { email, fullName, phone, password, roleName, pages, permissions, properties } = req.body;

        // Check existing email
        const existing = await User.findOne({ where: { email }, transaction: t });
        if (existing) {
            await t.rollback();
            return res.status(400).json({ message: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newAdminUser = await User.create({
            email,
            fullName,
            phone,
            password: hashedPassword,
            role: 3,
            status: 1,
            roleName,
            userType: "admin",
        }, { transaction: t });

        // Create permission
        const userPermission = await UserPermission.create({
            userId: newAdminUser.id,
            pages,
            permissions,
            properties
        }, { transaction: t });

        // Commit if all OK
        await t.commit();

        res.status(201).json({
            message: "Admin created successfully",
            admin: newAdminUser,
            permission: userPermission
        });

    } catch (error) {
        console.error(error);
        // Rollback on any error
        await t.rollback();
        res.status(500).json({ message: "Error creating admin", error: error.message });
    }
};

exports.editAdminUser = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { email, fullName, phone, roleName, pages, permissions, properties } = req.body;

        //Check if user exists
        const adminUser = await User.findOne({
            where: { id, [Op.or]: [{ userType: "admin" }, { role: 3 }] },
            transaction: t
        });

        if (!adminUser) {
            await t.rollback();
            return res.status(404).json({ message: "Admin not found" });
        }

        // Prepare update data
        const updatedData = {
            email,
            fullName,
            phone,
            roleName
        };

        //  Update user
        await adminUser.update(updatedData, { transaction: t });

        // Update or create permission
        const existingPermission = await UserPermission.findOne({
            where: { userId: adminUser.id },
            transaction: t
        });

        if (existingPermission) {
            await existingPermission.update({
                pages,
                permissions,
                properties
            }, { transaction: t });
        } else {
            await UserPermission.create({
                userId: adminUser.id,
                pages,
                permissions,
                properties
            }, { transaction: t });
        }

        // Commit everything
        await t.commit();

        res.status(200).json({
            message: "Admin updated successfully",
            admin: adminUser
        });

    } catch (error) {
        console.error("Error updating admin:", error);
        await t.rollback();
        res.status(500).json({ message: "Error updating admin", error: error.message });
    }
};

exports.getAllAdminUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { rows: adminUsers, count } = await User.findAndCountAll({
            where: {
                [Op.or]: [
                    { userType: "admin" },
                    { role: 3 }
                ]
            },
            include: {
                model: UserPermission,
                as: 'permission'
            },
            order: [["createdAt", "DESC"]],
            limit,
            offset
        });
        res.json({
            adminUsers,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            totalAdmins: count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

exports.getAdminById = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch admin by primary key
        const admin = await User.findOne({
            where: {
                id,
                [Op.or]: [
                    { userType: "admin" },
                    { role: 3 }
                ]
            },
            include: {
                model: UserPermission,
                as: 'permission'
            }
        });

        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }

        res.json({ admin });
    } catch (error) {
        console.error("Error fetching admin by ID:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

//toggle for active/inactive admin user
exports.toggleAdminStatus = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;

        //find admin user
        const adminUser = await User.findOne({
            where: {
                id, [Op.or]: [{ userType: "admin" }, { role: 3 }]
            }, transaction: t
        })

        if (!adminUser) {
            await t.rollback();
            return res.status(404).json({ message: "Admin not found" });
        }

        const newStatus = adminUser.status === 1 ? 0 : 1;

        await adminUser.update({ status: newStatus }, { transaction: t });
        await t.commit();
        res.status(200).json({
            message: `Admin user has been ${newStatus === 1 ? 'Activated' : 'Deactivated'} successfully.`,
            status: newStatus
        });
    } catch (error) { 
        console.error("Error toggling admin:", error);
        await t.rollback();
        res.status(500).json({ message: "Error toggling admin", error: error.message });
    }
}

