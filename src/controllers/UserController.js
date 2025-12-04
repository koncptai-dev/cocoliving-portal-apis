const User = require('../models/user');
const OTP = require('../models/otp');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
require('dotenv').config();
const otpGenerator = require("otp-generator");
// const jwt =require('jsonwebtoken');
const { sendResetEmail } = require('../utils/emailService'); // Utility for sending emails
const fs = require('fs');
const path = require('path');
const { mailsender } = require('../utils/emailService');

//send phone OTP
exports.sendPhoneOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        const userId = req.user.id;

        if (!phone) return res.status(400).json({ message: "Phone is required" });
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ message: "Invalid phone format" });
        }
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        await OTP.destroy({
            where: { type: "phone", identifier: phone }
        });

        const otp = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        })

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.create({
            identifier: phone,
            type: "phone",
            otp,
            expiresAt,
            attempts: 0,
        });

        // Send via SMS API (twilio / 2factor / msg91)
        console.log("Phone OTP:", otp);

        return res.status(200).json({
            success: true,
            message: "OTP sent to phone successfully"
        });

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

exports.verifyPhoneOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        const userId = req.user.id;

        if (!phone || !otp)
            return res.status(400).json({ message: "Phone & OTP are required" });

        const record = await OTP.findOne({
            where: { identifier: phone, type: "phone" },
            order: [["createdAt", "DESC"]]
        });

        if (!record) return res.status(400).json({ message: "OTP expired or not found" });

        if (record.expiresAt < new Date()) {
            await OTP.destroy({ where: { identifier: phone, type: 'phone' } });
            return res.status(400).json({ message: "OTP expired" });
        }

        if (record.otp !== otp) {
            await record.save();
            return res.status(400).json({ message: "Incorrect OTP" });
        }

        // VERIFIED SUCCESSFULLY
        await OTP.destroy({ where: { identifier: phone, type: 'phone' } });

        await User.update(
            { phone, isPhoneVerified: true },
            { where: { id: userId } }
        );

        res.status(200).json({
            success: true,
            message: "Phone number verified successfully",
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        await OTP.destroy({
            where: { expiresAt: { [Op.lt]: new Date() } }
        });

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        const existingUser = await User.findOne({ where: { email } });

        if (existingUser && !existingUser.registrationToken) {
            return res.status(401).json({ success: false, message: 'User is already registered' });
        }

        await OTP.destroy({ where: { identifier: email, type: 'email' } });

        const otp = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        });

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.create({ identifier: email, type: 'email', otp, expiresAt });

        await mailsender(
            email,
            "OTP Verification",
            `Your OTP for registration is: ${otp}\n\nThis OTP is valid for 5 minutes.`
        );

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.registerUser = async (req, res) => {
    try {
        const { fullName, email, phone, userType, gender, dateOfBirth, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "Email & OTP are required" });
        }

        const otpRecord = await OTP.findOne({
            where: { identifier: email, type: 'email' },
            order: [['createdAt', 'DESC']]
        });

        if (!otpRecord) {
            return res.status(400).json({ message: "OTP not found or expired" });
        }

        if (otpRecord.attempts >= 5) {
            await OTP.destroy({ where: { email } });
            return res.status(429).json({
                success: false,
                message: "Too many wrong attempts. Request a new OTP."
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            await OTP.destroy({ where: { email } });
            return res.status(400).json({ message: "OTP expired. Request a new one." });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return res.status(400).json({ message: "Incorrect OTP" });
        }

        // OTP verified,nd remove record
        await OTP.destroy({ where: { identifier: email, type: 'email' } });

        // Check if user already exists
        let userExist = await User.findOne({ where: { email } });

        if (userExist) {
            return res.status(400).json({ message: "Email already registered. Please login." });
        }

        // Create new user 
        const newUser = await User.create({
            fullName,
            email,
            phone,
            userType,
            gender,
            dateOfBirth,
            role: 2,
            status: 1,
        });
        return res.status(201).json({
            success: true,
            message: "User registered & verified successfully",
            user: newUser
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.editUserProfile = async (req, res) => {
    try {

        const { id } = req.params;
        const updates = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Phone update check first
        if (updates.phone !== undefined && updates.phone !== null) {

            const newPhone = updates.phone;

            if (user.isPhoneVerified) {
                return res.status(400).json({
                    message: "Phone number cannot be edited after verification"
                });
            }

            if (newPhone !== user.phone) {
                user.phone = newPhone.trim();
                user.isPhoneVerified = false;
            }

            delete updates.phone; //prevent multiple entry in loop 
        }

        //parent email validation
        if (updates.parentEmail !== undefined) {
            if (user.userType === "student") {  
                const newParentEmail = updates.parentEmail.trim();

                if (!newParentEmail) { 
                    user.parentEmail = null; 
                } else {
                    if (newParentEmail === user.email) {
                        return res.status(400).json({ message: "Parent email cannot be the same as user email" });
                    }
                    const conflict = await User.findOne({
                        where: {
                            email: newParentEmail, id: { [Op.ne]: user.id } // exclude current user
                        }
                    });
                    if (conflict) {
                        return res.status(400).json({ message: "Parent email cannot match another user's email" });
                    }
                    user.parentEmail = newParentEmail;
                }
            }
                delete updates.parentEmail; // Prevent multi entry in loop
            }

            for (const key in updates) {
                const value = updates[key];

                if (value === undefined || value === null) continue;

                //skip field for professional
                if (user.userType === "professional" && ["parentName", "parentMobile", "parentEmail", "collegeName", "course"].includes(key)) { continue }

                //skip for student
                if (user.userType === "student" && ["companyName", "position"].includes(key)) {
                    continue;
                }
                user[key] = typeof value === "string" ? value.trim() : value;

            }

            //if already has profileImage, delete the old one
            if (req.file) {
                if (user.profileImage) {
                    const oldPath = path.join(__dirname, '..', user.profileImage.replace(/^\//, ''));
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                    }
                }
                user.profileImage = `/uploads/profilePicture/${req.file.filename}`;
            }
            await user.save();

            return res.status(200).json({
                message: 'Profile updated successfully',
                user
            });
        } catch (err) {
            return res.status(500).json({ message: 'Error updating profile', error: err.message });
        }
    }

//delete user account its soft delete only
exports.deleteAccount = async (req, res) => {
        try {
            const userId = req.params.id;

            //find user exist
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'user not found' })
            }

            //check already deleted
            if (user.status === 0) {
                return res.status(400).json({ message: 'user already deleted' })
            }

            //soft delete
            await User.update({ status: 0 }, { where: { id: userId } })

            return res.status(200).json({ message: 'User account deleted successfully' });
        } catch (err) {
            return res.status(500).json({ message: 'Error deleting user account', error: err.message });
        }
    }

    //get the users by id
    exports.getUserById = async (req, res) => {
        try {
            const { id } = req.params;
            const user = await User.findByPk(id, { where: { status: 1 }, attributes: { exclude: ['password'] } });

            if (!user || user.status === 0) {
                return res.status(404).json({ message: 'No user found' });
            }

            return res.status(200).json({ success: true, user });
        } catch (err) {
            return res.status(500).json({ message: 'Error fetching users', error: err.message });
        }
    }



