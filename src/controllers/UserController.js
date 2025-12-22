const User = require('../models/user');
const UserKYC = require('../models/userKYC');
const OTP = require('../models/otp');
const { Op } = require('sequelize');
require('dotenv').config();
const otpGenerator = require("otp-generator");
const fs = require('fs');
const path = require('path');
const { mailsender } = require('../utils/emailService');
const { welcomeEmail , otpEmail } = require('../utils/emailTemplates/emailTemplates');
const { logApiCall } = require("../helpers/auditLog");
const { smsSender } = require("../utils/smsService");

//send phone OTP
exports.sendPhoneOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        const userId = req.user.id;

        if (!phone) {
            await logApiCall(req, res, 400, "Failed to send phone OTP - phone number required", "user", userId);
            return res.status(400).json({ message: "Phone is required" });
        }
        if (!/^\d{10}$/.test(phone)) {
            await logApiCall(req, res, 400, "Failed to send phone OTP - invalid phone format", "user", userId);
            return res.status(400).json({ message: "Invalid phone format" });
        }
        const user = await User.findByPk(userId);
        if (!user) {
            await logApiCall(req, res, 404, "Failed to send phone OTP - user not found", "user", userId);
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

        //sms sending
        await smsSender(phone, "otp", { otp });

        await logApiCall(req, res, 200, "Sent phone OTP for verification", "user", userId);
        return res.status(200).json({
            success: true,
            message: "OTP sent to phone successfully"
        });

    } catch (error) {
        await logApiCall(req, res, 500, "Error occurred while sending phone OTP", "user", req.user?.id || 0);
        return res.status(500).json({ message: error.message });
    }
}

exports.verifyPhoneOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        const userId = req.user.id;

        if (!phone || !otp) {
            await logApiCall(req, res, 400, "Failed to verify phone OTP - phone and OTP required", "user", userId);
            return res.status(400).json({ message: "Phone & OTP are required" });
        }

        const record = await OTP.findOne({
            where: { identifier: phone, type: "phone" },
            order: [["createdAt", "DESC"]]
        });

        if (!record) {
            await logApiCall(req, res, 400, "Failed to verify phone OTP - OTP expired or not found", "user", userId);
            return res.status(400).json({ message: "OTP expired or not found" });
        }

        if (record.expiresAt < new Date()) {
            await OTP.destroy({ where: { identifier: phone, type: 'phone' } });
            await logApiCall(req, res, 400, "Failed to verify phone OTP - OTP expired", "user", userId);
            return res.status(400).json({ message: "OTP expired" });
        }

        if (record.otp !== otp) {
            await record.save();
            await logApiCall(req, res, 400, "Failed to verify phone OTP - incorrect OTP", "user", userId);
            return res.status(400).json({ message: "Incorrect OTP" });
        }

        // VERIFIED SUCCESSFULLY
        await OTP.destroy({ where: { identifier: phone, type: 'phone' } });

        await User.update(
            { phone, isPhoneVerified: true },
            { where: { id: userId } }
        );

        await logApiCall(req, res, 200, "Verified phone number successfully", "user", userId);
        res.status(200).json({
            success: true,
            message: "Phone number verified successfully",
        });

    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while verifying phone OTP", "user", userId);
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
            await logApiCall(req, res, 400, "Failed to send email OTP - email required", "user");
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            await logApiCall(req, res, 400, "Failed to send email OTP - invalid email format", "user");
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        const existingUser = await User.findOne({ where: { email } });

        if (existingUser && !existingUser.registrationToken) {
            await logApiCall(req, res, 401, "Failed to send email OTP - user already registered", "user");
            return res.status(401).json({ success: false, message: 'User is already registered' });
        }

        await OTP.destroy({ where: { identifier: email, type: 'email' } });

    const record = await OTP.findOne({
      where: { identifier: phone, type: "phone" },
      order: [["createdAt", "DESC"]],
    });

    if (!record) {
      await logApiCall(
        req,
        res,
        400,
        "Failed to verify phone OTP - OTP expired or not found",
        "user",
        userId
      );
      return res.status(400).json({ message: "OTP expired or not found" });
    }

    if (record.expiresAt < new Date()) {
      await OTP.destroy({ where: { identifier: phone, type: "phone" } });
      await logApiCall(
        req,
        res,
        400,
        "Failed to verify phone OTP - OTP expired",
        "user",
        userId
      );
      return res.status(400).json({ message: "OTP expired" });
    }

        await OTP.create({ identifier: email, type: 'email', otp, expiresAt });

        const mail = otpEmail({otp});
        await mailsender(
            email,
            "Your Verification OTP",
            mail.html,
            mail.attachments
        );

        await logApiCall(req, res, 200, `Sent email OTP for registration to ${email}`, "user");
        return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
        });

    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while sending email OTP", "user");
        return res.status(500).json({ success: false, message: err.message });
    }

    await OTP.destroy({ where: { identifier: email, type: "email" } });

    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.create({ identifier: email, type: "email", otp, expiresAt });

    const mail = otpEmail({ otp });
    await mailsender(
      email,
      "Your Verification OTP",
      mail.html,
      mail.attachments
    );

    await logApiCall(
      req,
      res,
      200,
      `Sent email OTP for registration to ${email}`,
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
      "Error occurred while sending email OTP",
      "user"
    );
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.registerUser = async (req, res) => {
    try {
        const { fullName, email, phone, userType, gender, dateOfBirth, otp } = req.body;

        if (!email || !otp) {
            await logApiCall(req, res, 400, "Failed to register user - email and OTP required", "user");
            return res.status(400).json({ message: "Email & OTP are required" });
        }

        const otpRecord = await OTP.findOne({
            where: { identifier: email, type: 'email' },
            order: [['createdAt', 'DESC']]
        });

        if (!otpRecord) {
            await logApiCall(req, res, 400, "Failed to register user - OTP not found or expired", "user");
            return res.status(400).json({ message: "OTP not found or expired" });
        }

        if (otpRecord.attempts >= 5) {
            await OTP.destroy({ where: { email } });
            await logApiCall(req, res, 429, "Failed to register user - too many wrong OTP attempts", "user");
            return res.status(429).json({
                success: false,
                message: "Too many wrong attempts. Request a new OTP."
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            await OTP.destroy({ where: { email } });
            await logApiCall(req, res, 400, "Failed to register user - OTP expired", "user");
            return res.status(400).json({ message: "OTP expired. Request a new one." });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            await logApiCall(req, res, 400, "Failed to register user - incorrect OTP", "user");
            return res.status(400).json({ message: "Incorrect OTP" });
        }

        // OTP verified,nd remove record
        await OTP.destroy({ where: { identifier: email, type: 'email' } });

        // Check if user already exists
        let userExist = await User.findOne({ where: { email } });

        if (userExist) {
            await logApiCall(req, res, 400, "Failed to register user - email already registered", "user");
            return res.status(400).json({ message: "Email already registered. Please login." });
        }

        //image upload 
        let profileImagePath=null;
        if(req.file){
            profileImagePath=`/uploads/profilePicture/${req.file.filename}`;
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
        });
        try {
            const mail = welcomeEmail({firstName: newUser.fullName});
            await mailsender(
                newUser.email,
                'Welcome to Coco Living',
                mail.html,
                mail.attachments
            );
        } catch (err) {
            console.error('Welcome email failed:', err.message);
        }
        await logApiCall(req, res, 201, `Registered new user: ${fullName} (${email})`, "user", newUser.id);
        return res.status(201).json({
            success: true,
            message: "User registered & verified successfully",
            user: newUser
        });

    } catch (error) {
        await logApiCall(req, res, 500, "Error occurred while registering user", "user");
        return res.status(500).json({ message: "Server error", error: error.message });
    }
    await logApiCall(
      req,
      res,
      201,
      `Registered new user: ${fullName} (${email})`,
      "user",
      newUser.id
    );
    return res.status(201).json({
      success: true,
      message: "User registered & verified successfully",
      user: newUser,
    });
  } catch (error) {
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while registering user",
      "user"
    );
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

//profile edit
exports.editUserProfile = async (req, res) => {
    try {

        const { id } = req.params;
        const updates = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            await logApiCall(req, res, 404, `Updated user profile - user not found (ID: ${id})`, "user", parseInt(id));
            return res.status(404).json({ message: 'User not found' });
        }

        // Phone update check first
        if (updates.phone !== undefined && updates.phone !== null) {

            const newPhone = updates.phone;

            if (user.isPhoneVerified) {
                await logApiCall(req, res, 400, `Updated user profile - phone cannot be edited after verification (ID: ${id})`, "user", parseInt(id));
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

        for (const key in updates) {
            const value = updates[key];

    // Phone update check first
    if (updates.phone !== undefined && updates.phone !== null) {
      const newPhone = updates.phone;

      if (user.isPhoneVerified) {
        await logApiCall(
          req,
          res,
          400,
          `Updated user profile - phone cannot be edited after verification (ID: ${id})`,
          "user",
          parseInt(id)
        );
        return res.status(400).json({
          message: "Phone number cannot be edited after verification",
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
            await logApiCall(
              req,
              res,
              400,
              `Updated user profile - parent email cannot be same as user email (ID: ${id})`,
              "user",
              parseInt(id)
            );
            return res
              .status(400)
              .json({
                message: "Parent email cannot be the same as user email",
              });
          }
          const conflict = await User.findOne({
            where: {
              email: newParentEmail,
              id: { [Op.ne]: user.id }, // exclude current user
            },
          });
          if (conflict) {
            await logApiCall(
              req,
              res,
              400,
              `Updated user profile - parent email conflict (ID: ${id})`,
              "user",
              parseInt(id)
            );
            return res
              .status(400)
              .json({
                message: "Parent email cannot match another user's email",
              });
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
      user[key] = typeof value === "string" ? value.trim() : value;
    }

        await logApiCall(req, res, 200, `Updated user profile: ${user.fullName} (ID: ${id})`, "user", parseInt(id));
        return res.status(200).json({
            message: 'Profile updated successfully',
            user
        });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while updating user profile", "user", parseInt(req.params.id) || 0);
        return res.status(500).json({ message: 'Error updating profile', error: err.message });
    }
    await user.save();

    await logApiCall(
      req,
      res,
      200,
      `Updated user profile: ${user.fullName} (ID: ${id})`,
      "user",
      parseInt(id)
    );
    return res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while updating user profile",
      "user",
      parseInt(req.params.id) || 0
    );
    return res
      .status(500)
      .json({ message: "Error updating profile", error: err.message });
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

    //soft delete
    await User.update({ status: 0 }, { where: { id: userId } });

    await logApiCall(
      req,
      res,
      200,
      `Deleted user account: ${user.fullName} (ID: ${userId})`,
      "user",
      parseInt(userId)
    );
    return res
      .status(200)
      .json({ message: "User account deleted successfully" });
  } catch (err) {
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while deleting user account",
      "user",
      parseInt(req.params.id) || 0
    );
    return res
      .status(500)
      .json({ message: "Error deleting user account", error: err.message });
  }
};

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
