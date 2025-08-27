const sequelize = require('../config/database');
const User=require('../models/user'); 
const { Op } = require('sequelize');

exports.AddUser=async (req,res)=>{
    try{
        const{email,fullName,phone,occupation, userType,dateOfBirth, emergencyContactName,emergencyContactPhone}=req.body;

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
            emergencyContactName,
            emergencyContactPhone
        });

        res.status(201).json({
            message: "User added successfully",
            user: newUser
        });

    }catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}