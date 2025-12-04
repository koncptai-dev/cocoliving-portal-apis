const { verifyPANService } = require('../utils/panService');
const UserKYC = require('../models/userKYC');

exports.verifyPAN = async (req, res) => {
    try {
        const { panNumber } = req.body;
        const userId = req.user.id;

        if (!panNumber) {
            return res.status(400).json({ message: "PAN number is required" });
        }

        //check if db has the pan verified for the userId
        let userPanRecord = await UserKYC.findOne({
            where: { userId, panNumber }
        });

        if (userPanRecord && userPanRecord.panStatus === "verified") {
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
        await UserKYC.upsert({
            userId,
            panNumber,
            panStatus,
            verifiedAtPan: panStatus === "verified" ? new Date() : null,
            panKycResponse: JSON.stringify(response)
        });

        return res.status(200).json({ success: true, message: "PAN verified successfully", data:  panNumber,
                status: panStatus, });
    } catch (error) {
        console.error("Controller Error:", error.message);
        const statusCode = error.response?.status || 500;
        const message = error.response?.data?.message || error.message || "Internal Server Error during verification.";

        res.status(statusCode).json({ success: false, message: message, });
    }
}
