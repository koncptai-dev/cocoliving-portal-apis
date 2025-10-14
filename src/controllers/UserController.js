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


//for otp generate
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        //check user already exist or not
        const existingUser = await User.findOne({ where: { email } });

        if (existingUser) {
            return res.status(401).json({ success: false, message: 'User is already Registered' })
        }
        //if user not exist send otp
        const otp = otpGenerator.generate(5, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        })

        //check otp is unique or not
        let result = await OTP.findOne({ where: {otp} })
        while (result) {
            otp = otpGenerator.generate(5, {
                upperCaseAlphabets: false,
                lowerCaseAlphabets: false,
                specialChars: false,
            });
            result = await OTP.findOne({ where: { otp } });
        }
        //send otp in mail
        await mailsender(email, "OTP verification Email", `your OTP for Registration on cocoLiving is : ${otp}`)

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        //otp entry in db
        const otpPayload = { email, otp, expiresAt };
        const otpBody = await OTP.create(otpPayload);

        res.status(200).json({
            success: true,
            message: 'OTP Sent Successfully to your mail',
            otp,
        })
            ;
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: err.message
        })
    }
}


exports.registerUser = async (req, res) => {

    try {
        const { fullName, email, phone, userType, gender,dateOfBirth, password, confirmPassword, otp } = req.body;

        if (!otp) {
            return res.status(400).json({ message: "OTP is required" });
        }


        //match password and confirmPassword
        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Password and ConfirmPassword do not match' });
        }

        //check already registered user
        const existingUser = await User.findOne({
            where: { email },
        });

        if (existingUser) {
            return res.status(409).json({ success: false, message: "User is already registered with this email" });
        }

        const recentOTPRecord = await OTP.findOne({
            where: { email },
            order: [['createdAt', 'DESC']]
        })

        if (!recentOTPRecord || otp !== recentOTPRecord.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please check your code or resend."
            });
        }


        if (recentOTPRecord.expiresAt < new Date()) {
            await OTP.destroy({ where: { email } });
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new code."
            });
        }


        //hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        //create new user
        const newUser = await User.create({ fullName, email, phone: phone || null, userType, gender: gender || null, dateOfBirth, password: hashedPassword, role: 2 });

        await OTP.destroy({ where: { email } });

        res.status(201).json({ success: true, message: 'User registered and verified successfully', user: newUser });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
}

exports.editUserProfile = async (req, res) => {
    try {
       
        const { id } = req.params;
        const updates = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        for (const key in updates) {
            const value = updates[key];

            if (value === undefined || value === null) continue;

                //skip field for professional
                if(user.userType==="professional" && ["parentName","parentMobile","collegeName","course"].includes(key))
                {continue}

                //skip for student
                 if (user.userType === "user" && ["companyName", "position"].includes(key)) {
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



