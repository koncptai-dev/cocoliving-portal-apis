const { verifyPANService } = require('../utils/panService');
const UserKYC = require('../models/userKYC');
const User = require('../models/user');
const { logApiCall } = require("../helpers/auditLog");
const { nameMatchService } = require('../helpers/nameMatchfunction');

function normalizeName(name) {
    return name.toUpperCase()            // convert to uppercase
               .replace(/[^A-Z\s]/g, "") // remove dots, special characters
               .replace(/\s+/g, " ")    // remove extra spaces
               .trim();                 // trim leading/trailing spaces
}

//pan verification and name match
exports.verifyPAN = async (req, res) => {
    try {
        const { panNumber } = req.body;
        const userId = req.user.id;

        const role = req.user.role;
        if (![2, 3].includes(role)) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized role for KYC"
            });
        }

        //fetch users fullname
        const user = await User.findByPk(userId);
        const fullName = user?.fullName;
        
        const normalizedProfileName = normalizeName(fullName);

        if (!panNumber) {
            await logApiCall(req, res, 400, "Verified PAN - PAN number required", "userKYC", userId);
            return res.status(400).json({ message: "PAN number is required" });
        }

        if (!fullName) {
            await logApiCall(req, res, 400, "Verified PAN - Full name missing in profile", "userKYC", userId);
            return res.status(400).json({ message: "Full name is missing in user profile" });
        }

        //check if db has the pan verified for the userId
        let userPanRecord = await UserKYC.findOne({
            where: { userId,role, panNumber }
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

        //extract name from pan response for name match
        const panHolderName = response?.full_name || "";
        
        //call name match service
        const nameMatchResult = await nameMatchService(normalizedProfileName, panHolderName)      
        const { matchScore, matched } = nameMatchResult;

        //determinde decision based on match score
        const storeResult = panStatus === "verified" && matchScore >= 60;

        //for frontend clear message 
        let failureReason = null;
        if (!storeResult && panStatus === "verified") {
            failureReason = "Profile FullName does not match PAN records";
        }
        //  Save/update DB
        let userKycRecord = await UserKYC.findOne({ where: { userId,role } });

        if (userKycRecord) {
            // Update existing row (may already have Aadhaar info)
            userKycRecord.panNumber = panNumber;
            userKycRecord.panStatus = storeResult ? "verified" : "not-verified";;
            userKycRecord.verifiedAtPan = storeResult ? new Date() : null;
            if (storeResult) userKycRecord.panKycResponse = JSON.stringify(response);

            //name match response
            userKycRecord.panNameMatchResponse = JSON.stringify(nameMatchResult);
            userKycRecord.panNameMatchScore = matchScore;
            userKycRecord.panNameMatched = matched;

            await userKycRecord.save();
        } else {
            // Create new row if no record exists
            await UserKYC.create({
                userId,
                role,
                panNumber,
                panStatus: storeResult ? "verified" : "not-verified",
                verifiedAtPan: storeResult ? new Date() : null,
                panKycResponse: storeResult ? JSON.stringify(response) : null,
                panNameMatchResponse: JSON.stringify(nameMatchResult),
                panNameMatchScore: matchScore,
                panNameMatched: matched
            });
        }
        await logApiCall(req, res, 200, `Verified PAN - ${storeResult ? "success" : "failed"} (User ID: ${userId})`, "userKYC", userId);
        return res.status(200).json({
            success: storeResult, message: storeResult ? "PAN verified successfully" : "PAN verification failed",
            panStatus: storeResult ? "verified" : "not-verified",
            panNameMatchScore: matchScore,
            failureReason
        });
    } catch (error) {
        console.error("Controller Error:", error.message);
        const statusCode = error.response?.status || 500;
        const message = error.response?.data?.message || error.message || "Internal Server Error during verification.";
        await logApiCall(req, res, statusCode, "Error occurred while verifying PAN", "userKYC", req.user?.id || 0);
        res.status(statusCode).json({ success: false, message: message, });
    }
}
