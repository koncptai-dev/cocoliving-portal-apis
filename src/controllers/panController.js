const { verifyPANService } = require('../utils/panService');
const UserKYC = require('../models/userKYC');
const { logApiCall } = require("../helpers/auditLog");

exports.verifyPAN = async (req, res) => {
    try {
        const { panNumber } = req.body;
        const userId = req.user.id;

        if (!panNumber) {
            await logApiCall(req, res, 400, "Verified PAN - PAN number required", "userKYC", userId);
            return res.status(400).json({ message: "PAN number is required" });
        }

        //check if db has the pan verified for the userId
        let userPanRecord = await UserKYC.findOne({
            where: { userId, panNumber }
        });

        if (userPanRecord && userPanRecord.panStatus === "verified") {
            await logApiCall(req, res, 200, `Verified PAN - already verified (User ID: ${userId})`, "userKYC", userId);
            return res.status(200).json(
                {
                    success: true, message: "PAN already verified", data: {
                        panNumber: userPanRecord.panNumber,
                        status: userPanRecord.panStatus,
                        verifiedAt: userPanRecord.verifiedAtPan
                    }
                });
        }

        //call IDTO service if not verified 
        const response = await verifyPANService(panNumber);

        // extract status from API
        const panStatus = response?.status?.toLowerCase() === "success" ? "verified" : "not-verified";

        //  Save/update DB
        let userKycRecord = await UserKYC.findOne({ where: { userId } });

        if (userKycRecord) {
            // Update existing row (may already have Aadhaar info)
            userKycRecord.panNumber = panNumber;
            userKycRecord.panStatus = panStatus;
            userKycRecord.verifiedAtPan = panStatus === "verified" ? new Date() : null;
            userKycRecord.panKycResponse = JSON.stringify(response);

            await userKycRecord.save();
        } else {
            // Create new row if no record exists
            await UserKYC.create({
                userId,
                panNumber,
                panStatus,
                verifiedAtPan: panStatus === "verified" ? new Date() : null,
                panKycResponse: JSON.stringify(response)
            });
        }
        await logApiCall(req, res, 200, `Verified PAN - ${panStatus === "verified" ? "success" : "failed"} (User ID: ${userId})`, "userKYC", userId);
        return res.status(200).json({
            success: true, message: "PAN verified successfully", data: panNumber,
            status: panStatus,
        });
    } catch (error) {
        console.error("Controller Error:", error.message);
        const statusCode = error.response?.status || 500;
        const message = error.response?.data?.message || error.message || "Internal Server Error during verification.";
        await logApiCall(req, res, statusCode, "Error occurred while verifying PAN", "userKYC", req.user?.id || 0);
        res.status(statusCode).json({ success: false, message: message, });
    }
}
