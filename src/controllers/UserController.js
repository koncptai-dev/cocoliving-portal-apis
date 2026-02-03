const User = require('../models/user');
const UserKYC = require('../models/userKYC');
const OTP = require('../models/otp');
const { Op } = require('sequelize');
require('dotenv').config();
const otpGenerator = require("otp-generator");
const fs = require('fs');
const path = require('path');
const { mailsender } = require('../utils/emailService');
const { welcomeEmail, otpEmail } = require('../utils/emailTemplates/emailTemplates');
const { logApiCall } = require("../helpers/auditLog");
const { smsSender } = require("../utils/smsService");
const jwt = require('jsonwebtoken');


//send otp to phone / email foe verification from profile 
exports.sendProfileOTP = async (req, res) => {
  try {
    const { identifier, type } = req.body; // type = "phone" | "email"
    const userId = req.user.id;

    if (!identifier || !type) {
      return res.status(400).json({ message: "Identifier and type are required" });
    }

    if (type === "phone" && !/^\d{10}$/.test(identifier)) {
      return res.status(400).json({ message: "Invalid phone format" });
    }

    if (type === "email" && !/^\S+@\S+\.\S+$/.test(identifier)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    await OTP.destroy({ where: { identifier, type } });

    const otp = otpGenerator.generate(6, { upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.create({ identifier, type, otp, expiresAt, attempts: 0 });

    if (type === "phone") {
      await smsSender(identifier, "otp", { otp });
    } else if (type === "email") {
      const mail = otpEmail({ otp });
      await mailsender(identifier, "Your Verification OTP", mail.html, mail.attachments);
    }

    return res.status(200).json({ success: true, message: `OTP sent to ${type} successfully` });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.verifyProfileOTP = async (req, res) => {
  try {
    const { identifier, otp, type } = req.body;
    const userId = req.user.id;

    if (!identifier || !otp || !type) {
      return res.status(400).json({
        success: false,
        message: "Identifier, OTP & type are required"
      });
    }

    const record = await OTP.findOne({
      where: { identifier, type },
      order: [["createdAt", "DESC"]]
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not found"
      });
    }

    if (record.expiresAt < new Date()) {
      await OTP.destroy({ where: { identifier, type } });
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    if (record.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Incorrect OTP"
      });
    }

    // SUCCESS – Delete OTP
    await OTP.destroy({ where: { identifier, type } });

    if (type === "phone") {
      await User.update(
        { phone: identifier, isPhoneVerified: true },
        { where: { id: userId } }
      );
    }

    if (type === "email") {
      await User.update(
        { email: identifier, isEmailVerified: true },
        { where: { id: userId } }
      );
    }

    const user = await User.findByPk(userId);

    return res.status(200).json({
      success: true,
      message: `${type} verified successfully`,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

//register time (send otp)
exports.sendOTP = async (req, res) => {
  try {
    const { identifier } = req.body;

    //  Validate identifier
    if (!identifier) {
      await logApiCall(req, res, 400, "OTP send failed - identifier required", "user");
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required",
      });
    }

    const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
    const isPhone = /^\d{10}$/.test(identifier);

    if (!isEmail && !isPhone) {
      await logApiCall(req, res, 400, "OTP send failed - invalid identifier", "user");
      return res.status(400).json({
        success: false,
        message: "Invalid email or phone number",
      });
    }

    //  Remove expired OTPs
    await OTP.destroy({
      where: { expiresAt: { [Op.lt]: new Date() } },
    });

    //  Check if user already registered
    const whereCondition = isEmail
      ? { email: identifier }
      : { phone: identifier };

    const existingUser = await User.findOne({ where: whereCondition });

    if (existingUser && !existingUser.registrationToken) {
      await logApiCall(
        req,
        res,
        409,
        "OTP send failed - user already registered",
        "user",
        existingUser.id
      );
      return res.status(409).json({
        success: false,
        message: "User is already registered",
      });
    }

    //  Remove previous OTP for this identifier
    await OTP.destroy({
      where: {
        identifier,
        type: isEmail ? "email" : "phone",
      },
    });

    //  Generate OTP
    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.create({
      identifier,
      type: isEmail ? "email" : "phone",
      otp,
      expiresAt,
    });

    //  Send OTP (email only for now)
    if (isEmail) {
      const mail = otpEmail({ otp });
      await mailsender(
        identifier,
        "Your Verification OTP",
        mail.html,
        mail.attachments
      );
    }

    // (Optional future)
    if (isPhone) {
      await smsSender(identifier, "otp", { otp });

    }

    //  Log success
    await logApiCall(
      req,
      res,
      200,
      `OTP sent to ${isEmail ? "email" : "phone"}: ${identifier}`,
      "user"
    );

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while sending OTP",
      "user"
    );
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

//register (with otp verification)
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, phone, userType, gender, dateOfBirth, otp, parentName, parentMobile, parentEmail, type } = req.body;

    if (!email || !otp) {
      await logApiCall(req, res, 400, "Failed to register user - email and OTP required", "user");
      return res.status(400).json({ message: "Email & OTP are required" });
    }

    let otpRecord = "";
    if (type === "email") {
      otpRecord = await OTP.findOne({
        where: { identifier: email, type: 'email' },
        order: [['createdAt', 'DESC']]
      });
    } else {
      otpRecord = await OTP.findOne({
        where: { identifier: phone, type: 'phone' },
        order: [['createdAt', 'DESC']]
      });
    }

    if (!otpRecord) {
      await logApiCall(req, res, 400, "Failed to register user - OTP not found or expired", "user");
      return res.status(400).json({ message: "OTP not found or expired" });
    }

    if (otpRecord.expiresAt < new Date()) {
      if (type === "email") {
        await OTP.destroy({
          where: { identifier: email, type: 'email' }
        });
      } else {
        await OTP.destroy({
          where: { identifier: phone, type: 'phone' }
        });
      }
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    // OTP verified,nd remove record
    if (type === "email") {
      await OTP.destroy({
        where: { identifier: email, type: 'email' }
      });
    } else {
      await OTP.destroy({
        where: { identifier: phone, type: 'phone' }
      });
    }

    // Check if user already exists with same email or phone
    let userExist = await User.findOne({
      where: {
        [Op.or]: [{ email },
        { phone }]
      }
    });

    if (userExist) {
      if (userExist.phone === phone) {
        await logApiCall(req, res, 400, "Failed to register user - phone already registered", "user");
        return res.status(400).json({
          success: false,
          message: "Mobile number already registered. Please login."
        });
      }

      if (userExist.email === email) {
        await logApiCall(req, res, 400, "Failed to register user - email already registered", "user");
        return res.status(400).json({
          success: false,
          message: "Email already registered. Please login."
        });
      }
    }

    //if usertype=student add parent details
    if (userType === "student") {

      //require
      if (!parentName || !parentEmail) {
        await logApiCall(req, res, 400, "Failed to register user - parent details missing", "user");
        return res.status(400).json({
          message: "Parent name and email are required for students"
        });
      }
      //same email check
      if (parentEmail === email) {
        await logApiCall(req, res, 400, "Failed to register user - parent email cannot be same as user email", "user");
        return res.status(400).json({ message: "Parent email cannot be the same as student email" });
      }

      const parentConflict = await User.findOne({
        where: {
          email: parentEmail
        }
      })
      if (parentConflict) {
        await logApiCall(req, res, 400, "Failed to register user - parent email is a registered user email", "user");
        return res.status(400).json({ success: false, message: "Parent email is already registered as a student/professional email. Please use a different email" });
      }

    }

    //image upload 
    let profileImagePath = null;
    if (req.file) {
      profileImagePath = `/uploads/profilePicture/${req.file.filename}`;
    }

    // Create new user 
    const newUser = await User.create({
      fullName,
      email,
      phone,
      userType,
      gender,
      dateOfBirth,
      profileImage: profileImagePath,
      role: 2,
      status: 1,

      //only for student
      parentName: userType === "student" ? parentName : null,
      parentMobile: userType === "student" ? parentMobile : null,
      parentEmail: userType === "student" ? parentEmail : null,
    });
    try {
      const mail = welcomeEmail({ firstName: newUser.fullName });
      await mailsender(
        newUser.email,
        'Welcome to Coco Living',
        mail.html,
        mail.attachments
      );
    } catch (err) {
      console.error('Welcome email failed:', err.message);
    }

    // ================= JWT HERE =================
    const token = jwt.sign(
      {
        id: newUser.id,
        identifier: newUser.email || newUser.phone,
        role: newUser.role,
        userType: newUser.userType,
        loginAs: "user"
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    await logApiCall(req, res, 201, `Registered new user: ${fullName} (${email})`, "user", newUser.id);
    return res.status(201).json({
      success: true,
      message: "User registered & verified successfully",
      user: newUser,
      token
    });

  } catch (error) {
    await logApiCall(req, res, 500, "Error occurred while registering user", "user");
    return res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

//profile edit
exports.editUserProfile = async (req, res) => {
  try {

    const { id } = req.params;
    const updates = req.body;

    // Prevent accidental overwrite of verified flags
    delete updates.isEmailVerified;
    delete updates.isPhoneVerified;

    const user = await User.findByPk(id);
    if (!user) {
      await logApiCall(req, res, 404, `Updated user profile - user not found (ID: ${id})`, "user", parseInt(id));
      return res.status(404).json({ message: 'User not found' });
    }

    // Phone update check first
    if (updates.phone !== undefined && updates.phone !== null) {

      const newPhone = updates.phone.trim();

      if (user.isPhoneVerified && newPhone !== user.phone) {
        await logApiCall(req, res, 400, `Updated user profile - phone cannot be edited after verification (ID: ${id})`, "user", parseInt(id));
        return res.status(400).json({
          message: "Phone number cannot be edited after verification"
        });
      }

      if (newPhone !== user.phone) {
        const phoneExists = await User.findOne({
          where: {
            phone: newPhone,
            id: { [Op.ne]: user.id }
          }
        });

        if (phoneExists) {
          await logApiCall(req, res, 400, `Duplicate phone update attempt (ID: ${id})`, "user", parseInt(id));
          return res.status(400).json({
            message: "Mobile number already registered with another account"
          });
        }
        
        user.phone = newPhone.trim();
        user.isPhoneVerified = false;
      }

      delete updates.phone; //prevent multiple entry in loop 
    }

    // Email update check
    if (updates.email !== undefined && updates.email !== null) {
      const newEmail = updates.email.trim();

      // if already verified → block update 
      if (user.isEmailVerified) {
        return res.status(400).json({
          message: "Email cannot be edited after verification"
        });
      }

      if (newEmail !== user.email) {
        user.email = newEmail;
        user.isEmailVerified = false;
      }

      delete updates.email;
    }
    //parent email validation
    if (updates.parentEmail !== undefined) {
      if (user.userType === "student") {
        const newParentEmail = updates.parentEmail.trim();

        if (!newParentEmail) {
          user.parentEmail = null;
        } else {
          if (newParentEmail === user.email) {
            await logApiCall(req, res, 400, `Updated user profile - parent email cannot be same as user email (ID: ${id})`, "user", parseInt(id));
            return res.status(400).json({ message: "Parent email cannot be the same as user email" });
          }
          const conflict = await User.findOne({
            where: {
              email: newParentEmail, id: { [Op.ne]: user.id } // exclude current user
            }
          });
          if (conflict) {
            await logApiCall(req, res, 400, `Updated user profile - parent email conflict (ID: ${id})`, "user", parseInt(id));
            return res.status(400).json({ message: "Parent email cannot match another user's email" });
          }
          user.parentEmail = newParentEmail;
        }
      }
      delete updates.parentEmail; // Prevent multi entry in loop
    }

    //role wise field updates

    for (const key in updates) {
      const value = updates[key];

      if (value === undefined || value === null) continue;

      //skip field for professional
      if (
        user.userType === "professional" &&
        [
          "parentName",
          "parentMobile",
          "parentEmail",
          "collegeName",
          "course",
        ].includes(key)
      ) {
        continue;
      }

      //skip for student
      if (
        user.userType === "student" &&
        ["companyName", "position"].includes(key)
      ) {
        continue;
      }

      //fields for admin
      if(user.userType==="admin"){
        const allowAdminFields=["email", "fullName", "phone", "roleName",]
        if(!allowAdminFields.includes(key)){continue;}
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

    await logApiCall(req, res, 200, `Updated user profile: ${user.fullName} (ID: ${id})`, "user", parseInt(id));
    return res.status(200).json({
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while updating user profile", "user", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: 'Error updating profile', error: err.message });
  }
};

//delete user account its soft delete only
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.params.id;

    //find user exist
    const user = await User.findByPk(userId);
    if (!user) {
      await logApiCall(req, res, 404, `Deleted user account - user not found (ID: ${userId})`, "user", parseInt(userId));
      return res.status(404).json({ message: 'user not found' })
    }

    //check already deleted
    if (user.status === 0) {
      await logApiCall(req, res, 400, `Deleted user account - user already deleted (ID: ${userId})`, "user", parseInt(userId));
      return res.status(400).json({ message: 'user already deleted' })
    }

    //soft delete
    await User.update({ status: 0 }, { where: { id: userId } })

    await logApiCall(req, res, 200, `Deleted user account: ${user.fullName} (ID: ${userId})`, "user", parseInt(userId));
    return res.status(200).json({ message: 'User account deleted successfully' });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while deleting user account", "user", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: 'Error deleting user account', error: err.message });
  }
}

//get the users by id
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, { where: { status: 1 }, attributes: { exclude: ['password'] } });

    if (!user || user.status === 0) {
      await logApiCall(req, res, 404, `Viewed user details - user not found (ID: ${id})`, "user", parseInt(id));
      return res.status(404).json({ message: 'No user found' });
    }
    const kyc = await UserKYC.findOne({ where: { userId: user.id } });
    if (kyc) {
      user.dataValues.isPanVerified = kyc.panStatus === "verified";
      user.dataValues.isAadhaarVerified = kyc.ekycStatus === "verified";
    } else {
      user.dataValues.isPanVerified = false;
      user.dataValues.isAadhaarVerified = false;
    }
    await logApiCall(req, res, 200, `Viewed user details: ${user.fullName} (ID: ${id})`, "user", parseInt(id));
    return res.status(200).json({ success: true, user });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while fetching user details", "user", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
}
