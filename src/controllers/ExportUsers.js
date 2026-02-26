const Booking = require("../models/bookRoom");
const Property = require("../models/property")
const ExcelJS = require("exceljs");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");

exports.exportPropertyUsersZip = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ message: "Property ID is required" });
    }

    const property = await Property.findOne({
      where: {id: propertyId}
    });

    const bookings = await Booking.findAll({
      where: { propertyId },
      include: [
        {
          association: "user", // Booking -> User
          include: [
            {
              association: "kyc", // User -> UserKYC
            },
          ],
        },
      ],
    });

    if (!bookings.length) {
      return res.status(404).json({ message: "No users found" });
    }

    // -----------------------------------
    // 1️⃣ Remove duplicate users properly
    // -----------------------------------
    const uniqueUsers = new Map();

    bookings.forEach((booking) => {
      const user = booking.user; // ✅ correct alias

      if (user && !uniqueUsers.has(user.id)) {
        uniqueUsers.set(user.id, user);
      }
    });

    // -----------------------------------
    // 2️⃣ Create Excel in memory
    // -----------------------------------
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users With KYC");

    worksheet.columns = [
      { header: "User ID", key: "userId", width: 12 },
      { header: "Full Name", key: "fullName", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Gender", key: "gender", width: 15 },
      { header: "College", key: "collegeName", width: 25 },
      { header: "Company", key: "companyName", width: 25 },

      { header: "PAN Number", key: "panNumber", width: 20 },
      { header: "PAN Status", key: "panStatus", width: 20 },
      { header: "PAN Verified At", key: "verifiedAtPan", width: 25 },

      { header: "Aadhaar Last 4", key: "aadhaarLast4", width: 15 },
      { header: "eKYC Status", key: "ekycStatus", width: 20 },
      { header: "Aadhaar Verified At", key: "verifiedAtAadhaar", width: 25 },
      { header: "Media Filename", key: "mediaFilename", width: 30 },
    ];

    uniqueUsers.forEach((user) => {
      const kyc = user.kyc; // ✅ correct alias

      worksheet.addRow({
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        collegeName: user.collegeName,
        companyName: user.companyName,

        panNumber: kyc?.panNumber,
        panStatus: kyc?.panStatus,
        verifiedAtPan: kyc?.verifiedAtPan,

        aadhaarLast4: kyc?.aadhaarLast4,
        ekycStatus: kyc?.ekycStatus,
        verifiedAtAadhaar: kyc?.verifiedAtAadhaar,
        mediaFilename: user.fullname + "-" + user.phone
      });
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();

    // -----------------------------------
    // 3️⃣ Create ZIP Response
    // -----------------------------------
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${property.name}_users.zip`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    // Add Excel file
    archive.append(excelBuffer, { name: "Users_With_KYC.xlsx" });

    // -----------------------------------
    // 4️⃣ Add Media Folder
    // -----------------------------------
    const uploadBasePath = path.join(
      __dirname,
      "../uploads/kycDocuments"
    );

    uniqueUsers.forEach((user) => {
      const kyc = user.kyc;
      if (!kyc) return;

      const safeUserName = user.fullName
        ? user.fullName.replace(/[^a-zA-Z0-9]/g, "_")
        : `User_${user.id}`;

      const userFolderPath = `Media/${safeUserName}+"-"+${user.phone}/`;

      // -------- PAN FRONT --------
      if (kyc.panFrontImage) {
        const panPath = path.join(uploadBasePath, kyc.panFrontImage);

        if (fs.existsSync(panPath)) {
          const ext = path.extname(kyc.panFrontImage);
          archive.file(panPath, {
            name: `${userFolderPath}PanFront${ext}`,
          });
        }
      }

      // ------- AADHAAR FRONT --------
      if (kyc.aadhaarFrontImage) {
        const aadhaarFrontPath = path.join(
          uploadBasePath,
          kyc.aadhaarFrontImage
        );

        if (fs.existsSync(aadhaarFrontPath)) {
          const ext = path.extname(kyc.aadhaarFrontImage);
          archive.file(aadhaarFrontPath, {
            name: `${userFolderPath}AadharFront${ext}`,
          });
        }
      }

      // -------- AADHAAR BACK --------
      if (kyc.aadhaarBackImage) {
        const aadhaarBackPath = path.join(
          uploadBasePath,
          kyc.aadhaarBackImage
        );

        if (fs.existsSync(aadhaarBackPath)) {
          const ext = path.extname(kyc.aadhaarBackImage);
          archive.file(aadhaarBackPath, {
            name: `${userFolderPath}AadharBack${ext}`,
          });
        }
      }
    });

    await archive.finalize();
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};