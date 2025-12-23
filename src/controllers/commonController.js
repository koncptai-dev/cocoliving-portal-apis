const User = require('../models/user');
const UserPermission = require('../models/userPermissoin');
const Pages = require('../models/page');
const OTP = require("../models/otp");
const { otpEmail } = require('../utils/emailTemplates/emailTemplates');
const otpGenerator = require("otp-generator");
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { mailsender, sendResetEmail } = require('../utils/emailService');
const { logApiCall } = require("../helpers/auditLog");

//for admin and superadmin 
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const account = await User.findOne({ where: { email } });
        if (!account) {
            // For login attempts without user, we can't log with userId
            // But we can still log the attempt - we'll need to modify logApiCall to handle this
            // For now, we'll skip logging for "user not found" to avoid errors
            return res.status(404).json({ message: 'Invalid Email or Password' });
        }

        // Set req.user temporarily for logging purposes (even for failed attempts)
        req.user = { id: account.id, role: account.role };

        // normal user can't login with password
        if (account.role !== 1 && account.role !== 3) {
            await logApiCall(req, res, 403, `Login attempt - password login not allowed for user (ID: ${account.id})`, "auth", account.id);
            return res.status(403).json({
                message: "Password login is allowed only for admins. Please use OTP login."
            });
        }

        // Display message if user account deleted/deactivated
        if (account.status === 0) {
            await logApiCall(req, res, 403, `Login attempt - account deactivated (ID: ${account.id})`, "auth", account.id);
            return res.status(403).json({ message: "Your account is deactivated. Please contact admin." });
        }

        // Check password match
        const isMatch = await bcrypt.compare(password, account.password);
        if (!isMatch) {
            await logApiCall(req, res, 401, `Login attempt - invalid password (ID: ${account.id})`, "auth", account.id);
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

        // Create a mock req.user for logging since login doesn't have it yet
        req.user = { id: account.id, role: account.role };
        await logApiCall(req, res, 200, `${roleLabel} login successful: ${email}`, "auth", account.id);
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
        await logApiCall(req, res, 500, "Error occurred during login", "auth");
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
            await logApiCall(req, res, 404, "Send login OTP - email not found", "auth");
            return res.status(404).json({ message: "Email not found" });
        }

        // prevent admins from OTP login
        if (user.role === 1 || user.role === 3 || user.userType === "admin") {
            await logApiCall(req, res, 403, `Send login OTP - admin cannot use OTP login (ID: ${user.id})`, "auth", user.id);
            return res.status(403).json({ message: "Please use the admin login page" });
        }

        await OTP.destroy({ where: { identifier: email, type: 'email' } });

        // generate OTP (6 digits)
        let otp = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        });

        await OTP.create({
            identifier: email, type: 'email',
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // expires in 5 min
        });
        const mail = otpEmail({ otp });
        // send OTP email
        await mailsender(
            email,
            "Your Login OTP",
            mail.html,
            mail.attachments
        );

        req.user = { id: user.id };
        await logApiCall(req, res, 200, `Sent login OTP to ${email}`, "auth", user.id);
        return res.status(200).json({ success: true, message: "OTP sent to your email" });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while sending login OTP", "auth");
        return res.status(500).json({ message: "Error sending OTP", error: err.message });
    }
};

// VERIFY OTP FOR LOGIN
exports.verifyLoginOtp = async (req, res) => {
    try {
        const { email, otp,childId } = req.body;

        //find user by email
        let user = await User.findOne({ where: { email } });

        //if user not, found check for parent email
        if (!user) {
            if (childId) {
                // parent selected a specific child
                user = await User.findOne({ where: { id: childId, parentEmail: email } });
                if (!user) {
                    return res.status(400).json({ message: "Selected child not found" });
                }
            } else {
                // fallback to first child if no childId sent
                const children = await User.findAll({ where: { parentEmail: email } });
                if (!children.length) {
                    await logApiCall(req, res, 404, "Verify login OTP - email not found", "auth");
                    return res.status(404).json({ message: "Email not found" });
                }
                user = children[0]; 
            }
        }

        // fetch latest OTP entry
        const otpRecord = await OTP.findOne({
            where: { identifier: email, type: 'email' },
            order: [["createdAt", "DESC"]],
        });

        if (!otpRecord || otpRecord.otp !== otp) {
            await logApiCall(req, res, 400, `Verify login OTP - invalid OTP (ID: ${user.id})`, "auth", user.id);
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (otpRecord.expiresAt < new Date()) {
            await OTP.destroy({ where: { email } }); // delete expired otp
            await logApiCall(req, res, 400, `Verify login OTP - OTP expired (ID: ${user.id})`, "auth", user.id);
            return res.status(400).json({ message: "OTP expired, please request a new one" });
        }

        // delete OTP after successful login
        await OTP.destroy({ where: { identifier: email, type: 'email' } });

        // mark email verified if first login
        if (!user.isEmailVerified) {
            user.isEmailVerified = true;
            await user.save();
        }

        // determine login type
        const loginAs = (email === user.email) ? "user" : "parent";

        // generate JWT (same as existing login)
        const token = jwt.sign(
            { id: user.id, email: email, role: user.role, userType: user.userType, loginAs },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // return same response as password login
        req.user = { id: user.id, role: user.role };
        await logApiCall(req, res, 200, `OTP login successful: ${email} (${loginAs})`, "auth", user.id);
        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            account: user, loginAs
        });

    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while verifying login OTP", "auth");
        return res.status(500).json({ message: "Error verifying OTP", error: err.message });
    }
};

// CHECK EMAIL BEFORE OTP FLOW
exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            await logApiCall(req, res, 400, "Checked email - email required", "auth");
            return res.status(400).json({ message: "Email is required" });
        }

        let user = await User.findOne({ where: { email } });

        // Admin detection
        if (user && (user.role === 1 || user.role === 3 || user.userType === "admin")) {
            return res.json({
                exists: true,
                role: "admin",
                displayName: user.fullName || user.parentName || "Admin"
            });
        }

        // Normal user login (email matches user.email)
        if (user) {
            return res.json({
                exists: true,
                role: "user",
                loginAs: "user",
                displayName: user.fullName,
                childName: null
            });
        }

        // Parent login (email matches user.parentEmail)
        const children = await User.findAll({ where: { parentEmail: email }, order: [["id", "ASC"]]  });

        if (children.length > 0) {
            // Multiple students case
            if (children.length > 1) {
                return res.json({
                    exists: true,
                    role: "user",
                    loginAs: "parent",
                    multipleChildren: true,
                    displayName: children[0].parentName || "Parent",
                    children: children.map(c => ({
                        id: c.id,
                        name: c.fullName
                    }))
                });
            }

            // Single student parent login
            const child = children[0];
            return res.json({
                exists: true,
                role: "user",
                loginAs: "parent",
                multipleChildren: false,
                displayName: child.parentName || child.fullName,
                childName: child.fullName
            });
        }

        // New user
        await logApiCall(req, res, 200, `Checked email - new user (${email})`, "auth");
        return res.json({
            exists: false,
            role: null
        });

    } catch (error) {
        console.error("checkEmail error:", error);
        await logApiCall(req, res, 500, "Error occurred while checking email", "auth");
        return res.status(500).json({ message: "Internal server error" });
    }
};
