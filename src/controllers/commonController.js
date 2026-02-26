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
const { smsSender } = require('../utils/smsService');

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
        if (![1, 3, 4].includes(account.role)) {
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
        else if (account.role === 4) roleLabel = 'Service Member';   

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

//for default user 
const TEST_USERS = {
    [process.env.TEST_STUDENT_EMAIL]: "student",
    [process.env.TEST_PRO_EMAIL]: "professional",
    [process.env.TEST_PARENT_EMAIL]: "parent",
};

const TEST_OTP = process.env.TEST_OTP;


// SEND OTP FOR LOGIN
exports.sendLoginOtp = async (req, res) => {
    try {
        const { identifier, platform, appHash } = req.body;

        if (!identifier) {
            return res.status(400).json({ message: "Email or phone is required" });
        }
        /* ===== FOR TEST USER  ===== */
        if (TEST_USERS[identifier]) {
            return res.status(200).json({
                success: true,
                message: "Test user detected. Use default OTP."
            });
        }
        // cleanup expired OTPs
        await OTP.destroy({
            where: { expiresAt: { [Op.lt]: new Date() } }
        });

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
        const isPhone = /^\d{10}$/.test(identifier);

        if (!isEmail && !isPhone) {
            return res.status(400).json({ message: "Invalid email or phone" });
        }

        /* ================= FIND USER ================= */

        let user = null;

        if (isEmail) {
            // student / professional
            user = await User.findOne({ where: { email: identifier } });

            // parent
            if (!user) {
                user = await User.findOne({ where: { parentEmail: identifier } });
            }
        } else {
            // student / professional
            user = await User.findOne({ where: { phone: identifier } });

            // parent
            if (!user) {
                user = await User.findOne({ where: { parentMobile: identifier } });
            }
        }

        if (!user) {
            await logApiCall(req, res, 404, "Send login OTP - user not found", "auth");
            return res.status(404).json({ message: "User not found" });
        }

        // prevent admin OTP login
        if (user.role === 1 || user.role === 3 || user.userType === "admin") {
            await logApiCall(
                req,
                res,
                403,
                `Send login OTP - admin cannot use OTP login (ID: ${user.id})`,
                "auth",
                user.id
            );
            return res.status(403).json({ message: "Please use the admin login page" });
        }

        /* ================= OTP ================= */

        await OTP.destroy({
            where: {
                identifier,
                type: isEmail ? "email" : "phone"
            }
        });

        const otp = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            lowerCaseAlphabets: false,
            specialChars: false,
        });

        await OTP.create({
            identifier,
            type: isEmail ? "email" : "phone",
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        /* ================= SEND OTP ================= */

        if (isEmail) {
            const mail = otpEmail({ otp });
            await mailsender(
                identifier,
                "Your Login OTP",
                mail.html,
                mail.attachments
            );
        } else {
            await smsSender(identifier, "otp", { otp, platform, appHash });
        }

        req.user = { id: user.id };

        await logApiCall(
            req,
            res,
            200,
            `Sent login OTP to ${identifier}`,
            "auth",
            user.id
        );

        return res.status(200).json({
            success: true,
            message: isEmail
                ? "OTP sent to your email"
                : "OTP sent to your mobile"
        });

    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while sending login OTP", "auth");
        return res.status(500).json({
            message: "Error sending OTP",
            error: err.message
        });
    }
};

// VERIFY OTP FOR LOGIN
exports.verifyLoginOtp = async (req, res) => {
    try {
        const { identifier, otp, childId } = req.body;

        if (!identifier || !otp) {
            return res.status(400).json({ message: "Email/Phone and OTP are required" });
        }

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
        const isPhone = /^\d{10}$/.test(identifier);

        if (!isEmail && !isPhone) {
            return res.status(400).json({ message: "Invalid email or phone" });
        }

        /* ================= TEST LOGIN CHECK ================= */
        const isTestLogin =
            TEST_USERS[identifier] &&
            otp === TEST_OTP;

        /* ========================TEST LOGIN BYPASS (NO OTP TABLE / NO EMAIL)=============================*/

        if (isTestLogin) {
            let user;
            let loginAs = TEST_USERS[identifier] === "parent" ? "parent" : "user";

            if (otp !== TEST_OTP) {
                return res.status(400).json({ message: "Invalid OTP for test login" });
            }

            if (TEST_USERS[identifier] === "parent") {
                // For parent, pick first child
                const children = await User.findOne({ where: { parentEmail: identifier } });
                if (!children) {
                    return res.status(404).json({ success: false, message: "No child found for test parent" });
                }
                user = children;
                loginAs = "parent";

            } else {
                user = await User.findOne({ where: { email: identifier } });

                if (!user) {
                    user = await User.create({
                        fullName:
                            TEST_USERS[identifier] === "student"
                                ? "Test Student"
                                : "Test Professional",
                        email: identifier,
                        userType: TEST_USERS[identifier],
                        role: 2,
                        status: 1,
                    });
                }
            }
            const token = jwt.sign(
                {
                    id: user.id,
                    identifier,
                    role: user.role,
                    userType: user.userType,
                    loginAs
                },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );

            req.user = { id: user.id, role: user.role };

            await logApiCall(
                req,
                res,
                200,
                `TEST login successful: ${identifier}`,
                "auth",
                user.id
            );

            return res.status(200).json({
                success: true,
                message: "Test login successful",
                token,
                account: user,
                loginAs
            });
        }

        /* ================= FIND USER ================= */

        let user = null;

        if (isEmail) {
            // student / professional
            user = await User.findOne({ where: { email: identifier } });
        } else {
            // student / professional
            user = await User.findOne({ where: { phone: identifier } });
        }

        //if user not, found check for parent email
        if (!user) {
            if (childId) {
                // parent selected a specific child
                user = await User.findOne({
                    where: isEmail
                        ? { id: childId, parentEmail: identifier }
                        : { id: childId, parentMobile: identifier }
                });
                if (!user) {
                    return res.status(400).json({ message: "Selected child not found" });
                }
            } else {
                // fallback to first child if no childId sent
                const children = await User.findAll({
                    where: isEmail
                        ? { parentEmail: identifier }
                        : { parentMobile: identifier }
                });
                if (!children.length) {
                    await logApiCall(req, res, 404, "Verify login OTP - email not found", "auth");
                    return res.status(404).json({ message: "Email not found" });
                }
                user = children[0];
            }
        }

        /* ================= VERIFY OTP ================= */

        const otpRecord = await OTP.findOne({
            where: {
                identifier,
                type: isEmail ? "email" : "phone"
            },
            order: [["createdAt", "DESC"]],
        });

        if (!otpRecord || otpRecord.otp !== otp) {
            await logApiCall(
                req,
                res,
                400,
                `Verify login OTP - invalid OTP (ID: ${user.id})`,
                "auth",
                user.id
            );
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (otpRecord.expiresAt < new Date()) {
            await OTP.destroy({
                where: { identifier, type: isEmail ? "email" : "phone" }
            });
            await logApiCall(
                req,
                res,
                400,
                `Verify login OTP - OTP expired (ID: ${user.id})`,
                "auth",
                user.id
            );
            return res.status(400).json({ message: "OTP expired, please request a new one" });
        }

        // delete OTP after successful verification
        await OTP.destroy({
            where: { identifier, type: isEmail ? "email" : "phone" }
        });


        /* ================= LOGIN TYPE ================= */

        let loginAs = "user";

        if (isEmail) {
            loginAs = identifier === user.email ? "user" : "parent";
        } else {
            loginAs = identifier === user.phone ? "user" : "parent";
        }

        /* ================= MARK VERIFIED ================= */

        //email verified
        if (loginAs === "user") {
            if (isEmail && !user.isEmailVerified) {
                user.isEmailVerified = true;
            }

            if (isPhone && !user.isPhoneVerified) {
                user.isPhoneVerified = true;
            }

            await user.save();
        }

        /* ================= JWT ================= */

        const token = jwt.sign(
            {
                id: user.id,
                identifier,
                role: user.role,
                userType: user.userType,
                loginAs
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        req.user = { id: user.id, role: user.role };

        await logApiCall(
            req,
            res,
            200,
            `OTP login successful: ${identifier} (${loginAs})`,
            "auth",
            user.id
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            account: user,
            loginAs
        });

    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while verifying login OTP", "auth");
        return res.status(500).json({
            message: "Error verifying OTP",
            error: err.message
        });
    }
};

// CHECK EMAIL BEFORE OTP FLOW
exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body; // frontend still sends `email`

        if (!email) {
            await logApiCall(req, res, 400, "Checked email - email required", "auth");
            return res.status(400).json({ message: "Email is required" });
        }

        /* ================= TEST USER CHECK ================= */
        if (TEST_USERS[email]) {
            // TEST PARENT
            if (TEST_USERS[email] === "parent") {
                const child = await User.findOne({ where: { parentEmail: email } });

                if (!child) {
                    return res.status(404).json({ exists: false, message: "Test parent child not found" });
                }
                return res.json({
                    exists: true,
                    role: "user",
                    loginAs: "parent",
                    displayName: child.parentName || "Parent",
                    childName: child.fullName
                });
            }

            // test student and professional
            return res.json({
                exists: true,
                role: "user",
                loginAs: "user",
                displayName:
                    TEST_USERS[email] === "student"
                        ? "Test Student"
                        : "Test Professional",
                childName: null
            });
        }

        const identifier = email.trim();

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
        const isPhone = /^\d{10}$/.test(identifier);

        if (!isEmail && !isPhone) {
            return res.status(400).json({ message: "Invalid email or phone" });
        }

        /* ================= USER LOGIN (STUDENT) ================= */

        let user = null;

        if (isEmail) {
            user = await User.findOne({ where: { email: identifier } });
        } else {
            user = await User.findOne({ where: { phone: identifier } });
        }

        // Admin detection
        if (user && (user.role === 1 || user.role === 3 || user.userType === "admin")) {
            return res.json({
                exists: true,
                role: "admin",
                displayName: user.fullName || user.parentName || "Admin"
            });
        }

        // Student / normal user login
        if (user) {
            return res.json({
                exists: true,
                role: "user",
                loginAs: "user",   // student
                displayName: user.fullName,
                childName: null
            });
        }

        /* ================= PARENT LOGIN ================= */

        let children = [];

        if (isEmail) {
            children = await User.findAll({ where: { parentEmail: identifier } });
        } else {
            children = await User.findAll({ where: { parentMobile: identifier } });
        }

        if (children.length > 0) {
            // Multiple students
            if (children.length > 1) {
                return res.json({
                    exists: true,
                    role: "user",
                    loginAs: "parent",   //  parent
                    multipleChildren: true,
                    displayName: children[0].parentName || "Parent",
                    children: children.map(c => ({
                        id: c.id,
                        name: c.fullName
                    }))
                });
            }

            // Single student
            const child = children[0];
            return res.json({
                exists: true,
                role: "user",
                loginAs: "parent",   // parent
                multipleChildren: false,
                displayName: child.parentName || child.fullName,
                childName: child.fullName
            });
        }

        /* ================= NEW USER =  ================ */

        await logApiCall(
            req,
            res,
            200,
            `Checked email - new user (${identifier})`,
            "auth"
        );

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

