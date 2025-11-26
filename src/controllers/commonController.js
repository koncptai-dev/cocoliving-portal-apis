const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');
const Pages = require('../models/page');
const OTP = require('../models/otp');
const otpGenerator = require("otp-generator");
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { mailsender } = require('../utils/emailService');
const { sendResetEmail } = require('../utils/emailService'); // Utility for sending emails


exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const account = await User.findOne({ where: { email } });
        if (!account) {
            return res.status(404).json({ message: 'Invalid Email or Password' });
        }

        // normal user can't login with password
        if (account.role !== 1 && account.role !== 3) {
            return res.status(403).json({
                message: "Password login is allowed only for admins. Please use OTP login."
            });
        }

        // Display message if user account deleted/deactivated
        if (account.status === 0) {
            return res.status(403).json({ message: "Your account is deactivated. Please contact admin." });
        }

        // Check password match
        const isMatch = await bcrypt.compare(password, account.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid Email or Password' });
        }

        // Fetch permissions if admin
        let userPermissions = {};
        let userPages = [];
        let assignProperties = [];

        if (account.role === 3 || account.userType === 'admin') {
            const permRecord = await UserPermission.findOne({ where: { userId: account.id } });

            if (permRecord) {
                userPermissions = permRecord.permissions || {};

                const pageIds = (permRecord.pages || []).filter(Boolean);

                if (pageIds.length) {
                    const pages = await Pages.findAll({
                        where: { id: pageIds },
                        attributes: ['id', 'page_name'] // include id
                    });
                    userPages = pages.map(p => ({ id: p.id, name: p.page_name }));
                }

                assignProperties = permRecord.properties || [];
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: account.id, email: account.email, role: account.role, userType: account.userType },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );


        // Role-based label
        let roleLabel = 'User';
        if (account.role === 1) roleLabel = 'Superadmin';
        else if (account.role === 3) roleLabel = 'Admin';

        res.status(200).json({
            success: true,
            message: `${roleLabel} Login Successful`,
            token,
            account,
            permissions: userPermissions,
            pages: userPages,
            properties: assignProperties
        });

    } catch (err) {
        res.status(500).json({ message: 'Login error', error: err.message });
    }
};

// SEND OTP FOR LOGIN
exports.sendLoginOtp = async (req, res) => {
    try {
        const { email } = req.body;

        await OTP.destroy({
            where: { expiresAt: { [Op.lt]: new Date() } }
        });

        // user must exist
        let user = await User.findOne({ where: { email } });

        //if user not, found check for parent email
        if (!user) {
            user = await User.findOne({ where: { parentEmail: email } });
        }

        // no user found
        if (!user) {
            return res.status(404).json({ message: "Email not found" });
        }

        // prevent admins from OTP login
        if (user.role === 1 || user.role === 3 || user.userType === "admin") {
            return res.status(403).json({ message: "Please use the admin login page" });
        }

        await OTP.destroy({ where: { email } });

        // generate OTP (6 digits)
        let otp = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        });

        await OTP.create({
            email,
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // expires in 5 min
        });

        // send OTP email
        await mailsender(
            email,
            "Your Login OTP",
            `<p>Your OTP for login is <b>${otp}</b>. It expires in 5 minutes.</p>`
        );

        return res.status(200).json({ success: true, message: "OTP sent to your email" });
    } catch (err) {
        return res.status(500).json({ message: "Error sending OTP", error: err.message });
    }
};

// VERIFY OTP FOR LOGIN
exports.verifyLoginOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        //find user by email
        let user = await User.findOne({ where: { email } });

        //if user not, found check for parent email
        if (!user) {
            user = await User.findOne({ where: { parentEmail: email } });
        }

        if (!user) {
            return res.status(404).json({ message: "Email not found" });
        }

        // fetch latest OTP entry
        const otpRecord = await OTP.findOne({
            where: { email },
            order: [["createdAt", "DESC"]],
        });

        if (!otpRecord || otpRecord.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (otpRecord.expiresAt < new Date()) {
            await OTP.destroy({ where: { email } }); // delete expired otp
            return res.status(400).json({ message: "OTP expired, please request a new one" });
        }

        // delete OTP after successful login
        await OTP.destroy({ where: { email } });

        // determine login type
        const loginAs = (email === user.email) ? "user" : "parent";

        // generate JWT (same as existing login)
        const token = jwt.sign(
            { id: user.id, email: email, role: user.role, userType: user.userType, loginAs },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // return same response as password login
        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            account: user, loginAs
        });

    } catch (err) {
        return res.status(500).json({ message: "Error verifying OTP", error: err.message });
    }
};


exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.id;

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'New Password and Confirm Password do not match' });
        }


        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Old Password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hashedPassword });

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Error changing password', error: err.message });
    }
}


exports.sendResetCode = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'User Email not Found' })
        }
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetCode = resetCode;

        await user.save();

        await sendResetEmail(email, resetCode);
        res.status(200).json({ message: 'Reset code sent to your email' });

    } catch (err) {
        res.status(500).json({ message: 'Error sending reset code', error: err.message });
    }

}

//Forgot Password -reset password
exports.resetPassword = async (req, res) => {
    try {
        const { email, resetCode, newPassword } = req.body;

        const user = await User.findOne({
            where: { email, resetCode }
        })

        if (!user) {
            return res.status(404).json({ message: 'Invalid ResetCode or Email' })
        }
        //hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        user.resetCode = null; //clear reset code after use
        await user.save();

        res.status(200).json({ message: 'Password reset successfully' });

    } catch (err) {
        res.status(500).json({ message: 'Error resetting password', error: err.message });
    }
}


