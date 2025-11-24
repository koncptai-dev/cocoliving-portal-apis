const User = require('../models/user');
require("dotenv").config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const existingAdmin = await User.findOne({ where: { email } });

        if (existingAdmin) {
            return res.status(400).json({ message: 'super admin already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = await User.create(
            {
                email,
                password: hashedPassword, 
                role: 1,
                status:1,
                fullName: "super admin",
                userType: "super-admin"
            });
        res.status(201).json({ message: 'super admin registered successfully', admin: newAdmin });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

// exports.loginAdmin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         const admin = await Admin.findOne({ where: { email } });

//         if (!admin) {
//             return res.status(404).json({ message: 'Invalid Email or Password' });
//         }

//         const isPasswordValid = await bcrypt.compare(password, admin.password);
//         if (!isPasswordValid) {
//             return res.status(401).json({ message: 'Invalid Email or Password' });
//         }

//         const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
//         res.status(200).json({ message: 'Login Successful', token, admin })

//     } catch (error) {
//         res.status(500).json({ message: 'Login error', error: error.message });
//     }
// }