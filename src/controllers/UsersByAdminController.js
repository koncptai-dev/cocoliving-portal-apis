const sequelize = require('../config/database');
const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

exports.AddUser = async (req, res) => {
    try {
        const { email, fullName, phone, occupation, userType, dateOfBirth, gender } = req.body;

        if (!email || !fullName || !phone || !dateOfBirth) {
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
            occupation,
            dateOfBirth,
            gender,
            // emergencyContactName,
            // emergencyContactPhone
        });

        res.status(201).json({
            message: "User added successfully",
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
    try {
        const { email, fullName, phone, password, roleName, pages, permissions, properties } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdminUser = await User.create({
            email, fullName, phone, password: hashedPassword, role: 3, roleName, userType: "admin",
        })
        const userpermision = await UserPermission.create({
            userId: newAdminUser.id,   // link to created user
            pages: pages,
            permissions: permissions,
            properties: properties
        });
        res.status(201).json({ message: "Admin created successfully", admin: newAdminUser, permision: userpermision });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error creating admin", error });
    }
}

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