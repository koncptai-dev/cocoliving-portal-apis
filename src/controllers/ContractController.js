const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { Booking, User, Rooms, Property, Contract, Inventory } = require("../models");
const { mailsender } = require("../utils/emailService");
const { contractSignedEmail, securityDepositPaymentEmail } = require("../utils/emailTemplates/emailTemplates");
const { notifySecurityDeposit } = require('../utils/notificationService');
const { numberToRupeesWords } = require("../utils/numberToWords");

const normalize = str =>
  str
    ?.toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();


/**
 * Renders the HTML template into a PDF buffer using Puppeteer
 */
const renderContractPdf = async (booking,contract = null) => {
  const templateFile =
    booking.user.userType === "student"
      ? "contract-student.html"
      : "contract-professional.html";

  const templatePath = path.join(
    __dirname,
    "../utils/emailTemplates",
    templateFile
  );
  let html = fs.readFileSync(templatePath, "utf8");

  const { user, room } = booking;
  const date = new Date().toLocaleDateString("en-IN");


  // Signatures as Base64
  let inventoryTable = "";

  const assignedItemIds = booking.assignedItems || [];

  const assignedItems = assignedItemIds.length
    ? await Inventory.findAll({
        where: {
          id: assignedItemIds
        },
        attributes: ["itemName", "condition"]
      })
    : [];
  const findInventory = keyword =>
    assignedItems.find(item =>
      normalize(item.itemName).includes(normalize(keyword))
    );
  const dynamicItems = [
    { keyword: "bed", label: "Bed" },
    { keyword: "wardrobe", label: "Wardrobe" },
    { keyword: "study table", label: "Study Table" },
    { keyword: "chair", label: "Chair" }
  ];

  dynamicItems.forEach(({ keyword, label }) => {
    const item = findInventory(keyword);

    if (!item) return;

    inventoryTable += `
      <tr>
        <td>${label}</td>
        <td>1</td>
        <td>${item.condition || ""}</td>
        <td></td>
      </tr>
    `;
  });
  inventoryTable += `
  <tr>
    <td>Access Card / Key</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>Linen</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>AC Remote</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>Other Items</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  `;
  const residentAge =
    user.dateOfBirth
      ? Math.floor(
          (new Date() - new Date(user.dateOfBirth)) /
          (365.25 * 24 * 60 * 60 * 1000)
        )
      : "";
  // Replace placeholders
  const replacements = {
    agreement_date: date,

    resident_name: user.fullName || "",
    resident_email: user.email || "",
    resident_phone: user.phone || "",

    resident_age: residentAge,
    resident_dob: user.dateOfBirth || "",
    resident_address: user.address || "",

    educational_details: 
      user.collegeName && user.course
        ? `${user.collegeName} / ${user.course}`
        : !!user.collegeName
          ? user.collegeName
          : !!user.course
            ? user.course
            : "",

    student_year: user.studyingYear || "",
    guardian_name: user.parentName || "",
    guardian_relation: "Parent",
    guardian_address: user.address || "",
    guardian_phone: user.parentMobile || "",
    guardian_email: user.parentEmail || "",

    emergency_contact: "",

    property_name: room?.property?.name || "",
    property_address: room?.property?.address || "",

    room_type: room?.roomType || "",
    room_number: room?.roomNumber || "",
    bed_number: findInventory("bed")?.itemName || "N/A",

    commencement_date: booking.checkInDate || "",
    end_date: booking.checkOutDate || "",

    lockin_period: "3 Months",

    monthly_rent: booking.monthlyRent || "",
    security_deposit: booking.monthlyRent * 2 || "",
    advance_rent: "",

    electricity_rate: 12,

    notice_period: "30 Days",

    meal_preference: user.foodPreference || "",

    special_terms: "",

    late_payment_charges:
      room?.property?.lateFeePerDay
        ? `Rs. ${room.property.lateFeePerDay} per day`
        : "",

    unauthorized_occupancy_charges: "",

    replacement_charges: "As per actuals",

    resident_signature:
      contract?.tenantSignature
        ? `data:image/png;base64,${contract.tenantSignature}`
        : "",

    operator_signature:
      contract?.adminSignature
        ? `data:image/png;base64,${contract.adminSignature}`
        : "",

    guardian_signature: "",
    employer_name: user.companyName || "",
    resident_signed_date:
      contract?.residentSignedAt
        ? new Date(contract.residentSignedAt).toLocaleDateString("en-IN")
        : "",

    operator_signed_date:
      contract?.adminSignedAt
        ? new Date(contract.adminSignedAt).toLocaleDateString("en-IN")
        : "",
    designation: user.position || "",
    student_id_details: "",
    guardian_id_details: "",
    government_id_details: "",
    medical_conditions: "",
    official_email: "",
    employee_id: "",
    office_address: "",
    inventory_table: inventoryTable,
  };

  Object.entries(replacements).forEach(([key, value]) => {
    html = html.replace(
      new RegExp(`{{${key}}}`, "g"),
      value ?? ""
    );
  });
  const cssPath = path.join(
    __dirname,
    "../utils/emailTemplates/contractBase.css"
  );
  const css = fs.readFileSync(cssPath, "utf8");
  html = html.replace(
    "</head>",
    `<style>${css}</style></head>`
  );
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    printBackground: true
  });
  await browser.close();

  return pdfBuffer;
};

exports.getContract = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: User, as: "user" },
        { model: Rooms, as: "room", include: [{ model: Property, as: "property" }] }
      ]
    });

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "approved")
      return res.status(400).json({ message: "Booking not approved" });

    const isOwner = booking.userId === req.user.id;
    const isAdmin = req.user.role === 1;

    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: "Unauthorized" });

    if (booking.contractStatus === "SIGNED") {
      const existingContract = await Contract.findOne({ where: { bookingId } });
      return res.json({
        signed: true,
        adminSigned: booking.adminContractStatus === "SIGNED",
        fileUrl: `/uploads/contracts/${path.basename(existingContract.signedPdfPath)}`
      });
    }

    // Generate preview PDF (no signatures yet)
    const pdfBuffer = await renderContractPdf(booking);
    const tempPath = path.join(__dirname, `../uploads/contracts/temp-${bookingId}.pdf`);

    // Ensure directory exists
    const dir = path.dirname(tempPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(tempPath, pdfBuffer);

    return res.json({
      signed: false,
      fileUrl: `/uploads/contracts/temp-${bookingId}.pdf`
    });

  } catch (err) {
    console.error("Error in getContract:", err);
    return res.status(500).json({ message: err.message });
  }
};

exports.signContract = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: User, as: "user" },
        { model: Rooms, as: "room", include: [{ model: Property, as: "property" }] }
      ]
    });

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.userId !== req.user.id)
      return res.status(403).json({ message: "Only booking owner can sign" });
    if (booking.status !== "approved")
      return res.status(400).json({ message: "Booking not approved" });

    const existingContract = await Contract.findOne({ where: { bookingId } });
    if (existingContract)
      return res.status(400).json({ message: "Contract already signed" });

    if (!req.files?.tenantSignature) {
      return res.status(400).json({ message: "Tenant signature is required" });
    }

    if (booking.user.userType === "student" && !req.files?.guardianSignature) {
      return res.status(400).json({ message: "Guardian signature is required for students" });
    }

    // Prepare signatures as Base64 strings
    const tenantSigPath = req.files.tenantSignature[0].path;
    const tenantSigBase64 = fs.readFileSync(tenantSigPath).toString("base64");

    let guardianSigBase64 = null;
    let guardianSigPath = null;
    if (booking.user.userType === "student") {
      guardianSigPath = req.files.guardianSignature[0].path;
      guardianSigBase64 = fs.readFileSync(guardianSigPath).toString("base64");
    }
    const contract = await Contract.create({
      bookingId,
      signedPdfPath: "",
      tenantSignature: tenantSigBase64,
      residentSignedAt: new Date(),
    });

    const pdfBuffer = await renderContractPdf(
      booking,
      contract
    );

    const finalPath = path.join(
      __dirname,
      `../uploads/contracts/contract-${bookingId}.pdf`
    );

    fs.writeFileSync(finalPath, pdfBuffer);

    contract.signedPdfPath = finalPath;
    await contract.save();
    booking.contractStatus = "SIGNED";
    await booking.save();

    // Cleanup temp signature files immediately
    fs.unlinkSync(tenantSigPath);
    if (guardianSigPath) fs.unlinkSync(guardianSigPath);

    return res.json({
      message: "Contract signed successfully",
      fileUrl: `/uploads/contracts/contract-${bookingId}.pdf`
    });

  } catch (err) {
    console.error("Error in signContract:", err);
    return res.status(500).json({ message: err.message });
  }
};

exports.adminSignContract = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: User, as: "user" },
        { model: Rooms, as: "room", include: [{ model: Property, as: "property" }] }
      ]
    });

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.contractStatus !== "SIGNED")
      return res.status(400).json({ message: "Resident has not signed the contract yet" });

    if (booking.adminContractStatus === "SIGNED")
      return res.status(400).json({ message: "Admin has already signed this contract" });

    if (!req.files?.adminSignature) {
      return res.status(400).json({ message: "Admin signature is required" });
    }

    const contract = await Contract.findOne({ where: { bookingId } });
    if (!contract) return res.status(404).json({ message: "Contract record not found" });

    // 1. Get the uploaded admin signature image
    const adminSigPath = req.files.adminSignature[0].path;
    const adminSigBase64 = fs
      .readFileSync(adminSigPath)
      .toString("base64");

    contract.adminSignature = adminSigBase64;
    contract.adminSignedAt = new Date();

    await contract.save();

    const pdfBuffer = await renderContractPdf(
      booking,
      contract
    );

    fs.writeFileSync(
      contract.signedPdfPath,
      pdfBuffer
    );
    // Update status 
    booking.adminContractStatus = "SIGNED";
    await booking.save();


    // Cleanup temp signature file
    fs.unlinkSync(adminSigPath);

    // Send confirmation email with the FULLY signed contract
    const contractEmail = contractSignedEmail({
      userName: booking.user.fullName,
      bookingId: booking.id
    });

    await mailsender(
      booking.user.email,
      "Your Fully Signed Rental Agreement - CoCo Living",
      contractEmail.html,
      [
        ...contractEmail.attachments,
        {
          filename: `contract-${bookingId}.pdf`,
          path: contract.signedPdfPath
        }
      ]
    );

    if (!booking.securityDepositPaid) {
      await notifySecurityDeposit(booking);

      const email = securityDepositPaymentEmail({
        userName: booking.user.fullName,
        propertyName: booking.room.property.name,
        bookingId: booking.id
      });

      await mailsender(
        booking.user.email,
        "Security Deposit Payment Required - CoCo Living",
        email.html,
        email.attachments
      );
    } else {
      console.log(
        `Security deposit already paid for booking ${booking.id}. Skipping reminder.`
      );
    }

    return res.json({
      message: "Admin signature added successfully",
      fileUrl: `/uploads/contracts/${path.basename(contract.signedPdfPath)}`
    });

  } catch (err) {
    console.error("Error in adminSignContract:", err);
    return res.status(500).json({ message: err.message });
  }
};