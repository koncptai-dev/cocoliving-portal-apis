const User = require("../models/user");
const UserKYC = require("../models/userKYC");
const { generateAadhaarStylePDF } = require("../helpers/aadhaarPdf");
const { logApiCall } = require("../helpers/auditLog");

exports.getUserKYC = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      await logApiCall(req, res, 400, "Viewed user KYC - valid userId required", "userKYC");
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id", "fullName", "email", "phone", "userType", "status"],
    });

    if (!user) {
      await logApiCall(req, res, 404, `Viewed user KYC - user not found (ID: ${userId})`, "userKYC", parseInt(userId));
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.status === 0) {
      await logApiCall(req, res, 400, `Viewed user KYC - user account deactivated (ID: ${userId})`, "userKYC", parseInt(userId));
      return res.status(400).json({
        success: false,
        message: "User account is deactivated",
      });
    }

    const userKYC = await UserKYC.findOne({
      where: { userId: parseInt(userId) },
    });

    let panKycResponse = null;
    let adharKycResponse = null;

    if (userKYC?.panKycResponse) {
      try {
        panKycResponse = JSON.parse(userKYC.panKycResponse);
      } catch (e) {
        panKycResponse = userKYC.panKycResponse;
      }
    }

    if (userKYC?.adharKycResponse) {
      try {
        adharKycResponse = JSON.parse(userKYC.adharKycResponse);
      } catch (e) {
        adharKycResponse = userKYC.adharKycResponse;
      }
    }

    const response = {
      success: true,
      kyc: userKYC
        ? {
            id: userKYC.id,
            pan: {
              panNumber: userKYC.panNumber,
              status: userKYC.panStatus || "pending",
              verifiedAt: userKYC.verifiedAtPan,
              response: panKycResponse,
            },
            aadhaar: {
              last4: userKYC.aadhaarLast4,
              status: userKYC.ekycStatus || "not_verified",
              verifiedAt: userKYC.verifiedAtAadhaar,
              response: adharKycResponse,
            },
            createdAt: userKYC.createdAt,
            updatedAt: userKYC.updatedAt,
          }
        : null,
      message: userKYC
        ? "KYC data retrieved successfully"
        : "No KYC data found for this user",
    };

    await logApiCall(req, res, 200, `Viewed user KYC (User ID: ${userId})`, "userKYC", parseInt(userId));
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching user KYC:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching user KYC", "userKYC", parseInt(req.params.userId) || 0);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.downloadAadhaar = async (req, res) => {
  try {
    const { userId } = req.params;
    const userKYC = await UserKYC.findOne({
      where: { userId, ekycStatus: "verified" },
    });

    if (!userKYC) {
      await logApiCall(req, res, 404, `Downloaded Aadhaar - not verified (User ID: ${userId})`, "userKYC", parseInt(userId));
      return res.status(404).json({
        success: false,
        message: "Aadhaar not verified for this user",
      });
    }
    await logApiCall(req, res, 200, `Downloaded Aadhaar PDF (User ID: ${userId})`, "userKYC", parseInt(userId));
    await generateAadhaarStylePDF(userKYC, res);
  } catch (error) {
    console.error("Error downloading Aadhaar:", error);
    await logApiCall(req, res, 500, "Error occurred while downloading Aadhaar", "userKYC", parseInt(req.params.userId) || 0);
    res
      .status(500)
      .json({ success: false, message: "Failed to download Aadhaar" });
  }
};
