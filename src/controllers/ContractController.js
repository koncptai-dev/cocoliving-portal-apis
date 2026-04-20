const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");
const { Booking, User, Rooms, Property, Contract } = require("../models");
const { mailsender } = require("../utils/emailService");
const { contractSignedEmail, securityDepositPaymentEmail } = require("../utils/emailTemplates/emailTemplates");
const { notifySecurityDeposit } = require('../utils/notificationService');
const { numberToRupeesWords } = require("../utils/numberToWords");

/**
 * Renders the HTML template into a PDF buffer using Puppeteer
 */
const renderContractPdf = async (booking, signatures = {}) => {
  const templatePath = path.join(__dirname, "../utils/emailTemplates/contractpdf.html");
  let html = fs.readFileSync(templatePath, "utf8");

  const { user, room } = booking;
  const duration = booking.duration || 12;
  const monthlyRent = booking.monthlyRent || 0;
  const totalAmount = monthlyRent * duration;
  const date = new Date().toLocaleDateString("en-IN");

  // Room Type Checkboxes
  const roomTypes = ["Single Sharing Room", "Double Sharing Room", "Triple Sharing Room", "Premium Triple Sharing Room", "Quad sharing"];
  let checkboxesHtml = "";
  roomTypes.forEach(type => {
    // Case-insensitive check and handling variations of "Quad"
    const dbType = (booking.roomType || "").toLowerCase();
    const currentTabType = type.toLowerCase();

    let isChecked = dbType === currentTabType;

    // Extra handling for variations of Quad sharing
    if (currentTabType.includes("quad")) {
      isChecked = dbType.includes("quad") || dbType.includes("four");
    }

    checkboxesHtml += `<div>${isChecked ? "☑" : "☐"} ${type}</div>`;
  });

  // Signatures as Base64
  const tenantSigHtml = signatures.tenant ? `<img src="data:image/png;base64,${signatures.tenant}" class="signature-img" />` : "";

  let guardianSectionHtml = "";
  if (user.userType === "student") {
    const guardianSigHtml = signatures.guardian ? `<img src="data:image/png;base64,${signatures.guardian}" class="signature-img" />` : "";
    guardianSectionHtml = `
            <div>Guardian Name: <strong>${user.parentName || "Guardian"}</strong></div>
            <div class="sig-line">
                ${guardianSigHtml}
            </div>
            <div>Guardian Signature</div>
            <div style="margin-top: 5px;">Date: <strong>${date}</strong></div>
        `;
  }

  // Replace placeholders
  html = html
    .replace(/{{duration}}/g, duration)
    .replace(/{{total_amount}}/g, totalAmount.toLocaleString("en-IN"))
    .replace(/{{total_amount_words}}/g, numberToRupeesWords(totalAmount))
    .replace(/{{room_type_checkboxes}}/g, checkboxesHtml)
    .replace(/{{tenant_name}}/g, user.fullName)
    .replace(/{{tenant_signature}}/g, signatures.tenant ? `data:image/png;base64,${signatures.tenant}` : "")
    .replace(/{{operator_signature}}/g, signatures.admin ? `data:image/png;base64,${signatures.admin}` : "")
    .replace(/{{guardian_section}}/g, guardianSectionHtml)
    .replace(/{{date}}/g, date);

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

    const pdfBuffer = await renderContractPdf(booking, {
      tenant: tenantSigBase64,
      guardian: guardianSigBase64
    });

    const finalPath = path.join(__dirname, `../uploads/contracts/contract-${bookingId}.pdf`);
    fs.writeFileSync(finalPath, pdfBuffer);

    await Contract.create({
      bookingId,
      signedPdfPath: finalPath,
      signedAt: new Date(),
    });

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
    const adminImageBytes = fs.readFileSync(adminSigPath);

    // 2. Load the existing tenant-signed PDF
    const existingPdfBytes = fs.readFileSync(contract.signedPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // 3. Embed the new admin signature (handle both png and jpg)
    let adminImage;
    if (adminSigPath.toLowerCase().endsWith('.png') || adminImageBytes[0] === 0x89) {
      adminImage = await pdfDoc.embedPng(adminImageBytes);
    } else {
      adminImage = await pdfDoc.embedJpg(adminImageBytes);
    }

    // 4. Get the last page of the PDF
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    // Scale image down if it's too big, max 150x60
    const { width, height } = adminImage.scaleToFit(150, 60);

    // 5. STAMP the signature onto the last page!
    // Since we added `page-break-before: always` to the HTML, the signature
    // box is now GUARANTEED to be at the exact same Y-coordinate on the last page!
    // -> 0,0 is the BOTTOM-LEFT of the page.
    lastPage.drawImage(adminImage, {
      x: 55,    // Aligns perfectly with the left padding of the box
      y: 229,   // Aligns perfectly right on top of the signature line
      width: width,
      height: height,
    });

    // 6. Save the newly stamped PDF, overwriting the old one.
    const pdfBuffer = await pdfDoc.save();
    fs.writeFileSync(contract.signedPdfPath, pdfBuffer);

    // Update status 
    booking.adminContractStatus = "SIGNED";
    await booking.save();

    await notifySecurityDeposit(booking);

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

    // Send Security Deposit email
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

    return res.json({
      message: "Admin signature added successfully",
      fileUrl: `/uploads/contracts/${path.basename(contract.signedPdfPath)}`
    });

  } catch (err) {
    console.error("Error in adminSignContract:", err);
    return res.status(500).json({ message: err.message });
  }
};