const sequelize = require('../config/database');
const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { mailsender } = require('../utils/emailService');
const { Op } = require('sequelize');
const { logApiCall } = require("../helpers/auditLog");

exports.AddUser = async (req, res) => {
    try {
        const { email, fullName, phone, userType, } = req.body;

        if (!email || !fullName || !phone) {
            await logApiCall(req, res, 400, "Added user - required fields missing", "user");
            return res.status(400).json({ message: "Required fields are missing" });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing) {
            await logApiCall(req, res, 400, `Added user - email already exists (${email})`, "user");
            return res.status(400).json({ message: "Email already exists" });
        }

        const newUser = await User.create({
            email,
            fullName,
            phone,
            userType,
            status: 1,
        });

        //send login link to user to entered email
        const loginLink = process.env.LOGIN_URL;

        // email body
        const emailBody = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Welcome to COCO LIVING, ${fullName}!</h2>
                <p>Your account has been created by the  Admin.</p>
                <p>Please click the button below to go to the login page. You will need to enter your email (${email}) and then request a one-time password (OTP) to sign in.</p>                <p style="text-align:center;">
                <a href="${loginLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Go to Login Page
                </a>
                </p>
                <p>If the button doesn’t work, click this link:<br/>
                <a href="${loginLink}">${loginLink}</a>
                </p>
                <p>Thank you,<br/>The COCO LIVING Team</p>
            </div>
            `;

        //send the email
        await mailsender(email, "Your New Account Details - COCO LIVING", emailBody);

        await logApiCall(req, res, 201, `Added new user: ${fullName} (${email}, ID: ${newUser.id})`, "user", newUser.id);
        res.status(201).json({
            message: `User added successfully.Login email sent to ${email}`,
            user: newUser
        });

    } catch (error) {
        console.error(error);
        await logApiCall(req, res, 500, "Error occurred while adding user", "user");
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

        await logApiCall(req, res, 200, "Viewed all users list", "user");
        res.json({ users, curretnPage: page, totalPages: Math.ceil(count / limit), totalUsers: count });
    } catch (error) {
        await logApiCall(req, res, 500, "Error occurred while fetching all users", "user");
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
            await logApiCall(req, res, 400, `Created admin user - email already exists (${email})`, "user");
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

        await logApiCall(req, res, 201, `Created new admin user: ${fullName} (${email}, ID: ${newAdminUser.id})`, "user", newAdminUser.id);
        res.status(201).json({
            message: "Admin created successfully",
            admin: newAdminUser,
            permission: userPermission
        });

    } catch (error) {
        console.error(error);
        // Rollback on any error
        await t.rollback();
        await logApiCall(req, res, 500, "Error occurred while creating admin user", "user");
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

        await logApiCall(req, res, 200, `Updated admin user: ${adminUser.fullName} (ID: ${id})`, "user", parseInt(id));
        res.status(200).json({
            message: "Admin updated successfully",
            admin: adminUser
        });

    } catch (error) {
        console.error("Error updating admin:", error);
        await t.rollback();
        await logApiCall(req, res, 500, "Error occurred while updating admin user", "user", parseInt(req.params.id) || 0);
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
        await logApiCall(req, res, 200, "Viewed all admin users list", "user");
        res.json({
            adminUsers,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            totalAdmins: count
        });
    } catch (error) {
        console.error(error);
        await logApiCall(req, res, 500, "Error occurred while fetching all admin users", "user");
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
            await logApiCall(req, res, 404, `Viewed admin user - admin not found (ID: ${id})`, "user", parseInt(id));
            return res.status(404).json({ message: "Admin not found" });
        }

        await logApiCall(req, res, 200, `Viewed admin user: ${admin.fullName} (ID: ${id})`, "user", parseInt(id));
        res.json({ admin });
    } catch (error) {
        console.error("Error fetching admin by ID:", error);
        await logApiCall(req, res, 500, "Error occurred while fetching admin user", "user", parseInt(req.params.id) || 0);
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
            await logApiCall(req, res, 404, `Toggled admin status - admin not found (ID: ${id})`, "user", parseInt(id));
            return res.status(404).json({ message: "Admin not found" });
        }

        const newStatus = adminUser.status === 1 ? 0 : 1;

        await adminUser.update({ status: newStatus }, { transaction: t });
        await t.commit();
        await logApiCall(req, res, 200, `Toggled admin status to ${newStatus === 1 ? 'active' : 'inactive'} (ID: ${id})`, "user", parseInt(id));
        res.status(200).json({
            message: `Admin user has been ${newStatus === 1 ? 'Activated' : 'Deactivated'} successfully.`,
            status: newStatus
        });
    } catch (error) { 
        console.error("Error toggling admin:", error);
        await t.rollback();
        await logApiCall(req, res, 500, "Error occurred while toggling admin status", "user", parseInt(req.params.id) || 0);
        res.status(500).json({ message: "Error toggling admin", error: error.message });
    }
}

