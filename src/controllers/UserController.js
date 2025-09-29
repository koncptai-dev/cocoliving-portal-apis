const User = require('../models/user');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
require('dotenv').config();
// const jwt =require('jsonwebtoken');
const { sendResetEmail } = require('../utils/emailService'); // Utility for sending emails
const fs = require('fs');
const path = require('path');


exports.registerUser = async (req, res) => {

    try {
        const { fullName, email, phone, userType, gender, password, confirmPassword } = req.body;

        //match password and confirmPassword
        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Password and ConfirmPassword do not match' });
        }

        //check already registered user
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }],
            },
        });

        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(409).json({ message: "User with this email already exists" });
            }
        }

        //hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        //create new user
        const newUser = await User.create({ fullName, email, phone:phone || null,userType,gender:gender || null, password: hashedPassword, role: 2 });

        res.status(201).json({ success: true, message: 'User registered successfully', user: newUser });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
}

// exports.loginUser=async (req, res) => {
//     try{
//     const {email,password}=req.body;

//     //check fields required
//     if (!email || !password) {
//       return res.status(400).json({ message: 'Email and password are required' });
//     }

//     //check user exists
//     const user=await User.findOne({where:{email}})
//     if(!user){
//         return res.status(404).json({message:'User Not Found'});
//     }

//     //display msg if user account deleted 
//     if(user.status===0){
//         return res.status(400).json({message:'User Account does not exist or has been deleted'});
//     }

//     //check password match
//     const isMatch=await bcrypt.compare (password,user.password);

//     if(!isMatch){
//         return res.status(401).json({message:'Invalid Email or Password'});
//     }

//     //generate token
//     const token=jwt.sign({id:user.id,email:user.email,userType:user.userType},process.env.JWT_SECRET,{expiresIn:'1d'});

//     res.status(200).json({message:'Login Successful',token,user});
//     }catch(err){
//             res.status(500).json({ message: 'Login error', error: err.message });

//     }
// }


//Forgot Password - send reset code



//Edit User Profile

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

            if (value !== undefined && value !== null && String(value).trim() !== "") {
                user[key] = typeof value === "string" ? value.trim() : value;
            }
        }

        //if already has profileImage, delete the old one
        if (req.file) {
            if (user.profileImage) {
                const profileFolder = 'profilePicture';
                const oldPath = path.join(__dirname, '..', 'uploads', profileFolder, user.profileImage);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            user.profileImage = req.file.filename;
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


