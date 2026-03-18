const { verifyPANService } = require('../utils/panService');
const UserKYC = require('../models/userKYC');
const User = require('../models/user');
const { logApiCall } = require("../helpers/auditLog");
const { nameMatchService } = require('../helpers/nameMatchfunction');

function normalizeName(name) {
    console.log("normalizeName input:", name);

    const result = name.toUpperCase()
        .replace(/[^A-Z\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    console.log("normalizeName output:", result);
    return result;
}

exports.verifyPAN = async (req, res) => {

    console.log("========== PAN VERIFY START ==========");

    try {

        console.log("Request body:", req.body);
        console.log("User object:", req.user);

        const { panNumber } = req.body;
        const userId = req.user.id;

        const role = req.user.role;

        console.log("PAN Number:", panNumber);
        console.log("User ID:", userId);
        console.log("Role:", role);

        if (![2, 3].includes(role)) {
            console.log("Unauthorized role detected:", role);

            return res.status(403).json({
                success: false,
                message: "Unauthorized role for KYC"
            });
        }

        console.log("Fetching user from DB...");
        const user = await User.findByPk(userId);

        console.log("User fetched:", user);

        const fullName = user?.fullName;

        console.log("User fullName:", fullName);

        const normalizedProfileName = normalizeName(fullName);

        if (!panNumber) {

            console.log("PAN number missing");

            await logApiCall(req, res, 400, "Verified PAN - PAN number required", "userKYC", userId);

            return res.status(400).json({ message: "PAN number is required" });
        }

        if (!fullName) {

            console.log("User fullName missing in profile");

            await logApiCall(req, res, 400, "Verified PAN - Full name missing in profile", "userKYC", userId);

            return res.status(400).json({ message: "Full name is missing in user profile" });
        }

        console.log("Checking existing PAN record...");

        let userPanRecord = await UserKYC.findOne({
            where: { userId, role, panNumber }
        });

        console.log("Existing PAN record:", userPanRecord);

        if (userPanRecord && userPanRecord.panStatus === "verified") {

            console.log("PAN already verified in DB");

            await logApiCall(req, res, 200, `Verified PAN - already verified (User ID: ${userId})`, "userKYC", userId);

            return res.status(200).json({
                success: true,
                message: "PAN already verified",
                data: {
                    panNumber: userPanRecord.panNumber,
                    status: userPanRecord.panStatus,
                    verifiedAt: userPanRecord.verifiedAtPan
                }
            });
        }

        console.log("Calling verifyPANService...");

        const response = await verifyPANService(panNumber);

        console.log("PAN service response:", response);

        const panStatus = response?.status?.toLowerCase() === "success" ? "verified" : "not-verified";

        console.log("PAN status interpreted:", panStatus);

        const panHolderName = response?.full_name || "";

        console.log("PAN holder name:", panHolderName);

        console.log("Calling nameMatchService...");
        console.log("Profile name:", normalizedProfileName);
        console.log("PAN name:", panHolderName);

        const nameMatchResult = await nameMatchService(normalizedProfileName, panHolderName);

        console.log("Name match result:", nameMatchResult);

        const { matchScore, matched } = nameMatchResult;

        console.log("matchScore:", matchScore);
        console.log("matched:", matched);

        const storeResult = panStatus === "verified" && matchScore >= 60;

        console.log("storeResult decision:", storeResult);

        let failureReason = null;

        if (!storeResult && panStatus === "verified") {
            failureReason = "Profile FullName does not match PAN records";
        }

        console.log("failureReason:", failureReason);

        console.log("Fetching KYC record for update...");

        let userKycRecord = await UserKYC.findOne({ where: { userId, role } });

        console.log("Existing KYC record:", userKycRecord);

        if (userKycRecord) {

            console.log("Updating existing KYC record...");

            userKycRecord.panNumber = panNumber;
            userKycRecord.panStatus = storeResult ? "verified" : "not-verified";
            userKycRecord.verifiedAtPan = storeResult ? new Date() : null;

            if (storeResult) {
                userKycRecord.panKycResponse = JSON.stringify(response);
            }

            userKycRecord.panNameMatchResponse = JSON.stringify(nameMatchResult);
            userKycRecord.panNameMatchScore = matchScore;
            userKycRecord.panNameMatched = matched;

            await userKycRecord.save();

            console.log("KYC record updated");
        } else {

            console.log("Creating new KYC record...");

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

            console.log("New KYC record created");
        }

        if (req.file) {

            console.log("PAN image uploaded:", req.file);

            await UserKYC.update(
                { panFrontImage: `/uploads/kycDocuments/${req.file.filename}` },
                { where: { userId } }
            );

            console.log("PAN image path stored in DB");
        }

        await logApiCall(req, res, 200, `Verified PAN - ${storeResult ? "success" : "failed"} (User ID: ${userId})`, "userKYC", userId);

        console.log("========== PAN VERIFY END ==========");

        return res.status(200).json({
            success: storeResult,
            message: storeResult ? "PAN verified successfully" : "PAN verification failed",
            panStatus: storeResult ? "verified" : "not-verified",
            panNameMatchScore: matchScore,
            failureReason
        });

    } catch (error) {

        console.error("PAN Controller Error:", error);

        const statusCode = error.response?.status || 500;
        const message = error.response?.data?.message || error.message || "Internal Server Error during verification.";

        await logApiCall(req, res, statusCode, "Error occurred while verifying PAN", "userKYC", req.user?.id || 0);

        res.status(statusCode).json({
            success: false,
            message: message
        });
    }
}