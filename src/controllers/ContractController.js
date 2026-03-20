const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { Booking, User, Rooms, Property, Contract } = require("../models");
const { mailsender } = require("../utils/emailService");
const { securityDepositPaymentEmail } = require("../utils/emailTemplates/emailTemplates");
const { notifySecurityDeposit } = require('../utils/notificationService');

const generateBasePdf = async (booking) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { user, room } = booking;
  const property = room.property;

  const today = new Date().toLocaleDateString();

  const content = `
COCO LIVING RENTAL AGREEMENT

This agreement is made on ${today}

Tenant Name: ${user.fullName}
Property Name: ${property.name}
Room Type: ${booking.roomType}
Room Number: ${room.roomNumber}
Booking Type: ${booking.bookingType}

Check-in Date: ${booking.checkInDate}
Check-out Date: ${booking.checkOutDate}
Duration: ${booking.duration} months

Monthly Rent: Rs. ${booking.monthlyRent}
Security Deposit: Rs. ${room.depositAmount}

`;

  page.drawText(content, {
    x: 50,
    y: 700,
    size: 12,
    font,
    color: rgb(0, 0, 0),
    lineHeight: 18,
  });

  return pdfDoc;
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
        fileUrl: `/uploads/contracts/${path.basename(existingContract.signedPdfPath)}`
      });
    }

    const pdfDoc = await generateBasePdf(booking);
    const pdfBytes = await pdfDoc.save();

    const tempPath = path.join(__dirname, "../uploads/contracts/temp-" + bookingId + ".pdf");
    fs.writeFileSync(tempPath, pdfBytes);

    return res.json({
      signed: false,
      fileUrl: `/uploads/contracts/temp-${bookingId}.pdf`
    });

  } catch (err) {
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

    const pdfDoc = await generateBasePdf(booking);
    const tenantSigPath = req.files.tenantSignature[0].path;

    const tenantImageBytes = fs.readFileSync(tenantSigPath);

    const tenantPng = await pdfDoc.embedPng(tenantImageBytes);
    let guardianSigPath = null;
    let guardianPng = null;

    if (booking.user.userType === "student") {
      guardianSigPath = req.files.guardianSignature[0].path;
      const guardianImageBytes = fs.readFileSync(guardianSigPath);
      guardianPng = await pdfDoc.embedPng(guardianImageBytes);
    }

    
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const signedAt = new Date();
    const formattedDate = signedAt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    /* TENANT SIGNATURE */
    page.drawText("Tenant Signature:", {
      x: 80,
      y: 200,
      size: 10,
      font,
    });

    page.drawImage(tenantPng, {
      x: 80,
      y: 140,
      width: 150,
      height: 50,
    });

    page.drawText(`Signed By: ${booking.user.fullName}`, {
      x: 80,
      y: 125,
      size: 9,
      font,
    });

    page.drawText(`Date: ${formattedDate}`, {
      x: 80,
      y: 112,
      size: 9,
      font,
    });

    if (booking.user.userType === "student") {
      /* GUARDIAN SIGNATURE */
      page.drawText("Guardian Signature:", {
        x: 350,
        y: 200,
        size: 10,
        font,
      });

      page.drawImage(guardianPng, {
        x: 350,
        y: 140,
        width: 150,
        height: 50,
      });

      page.drawText(`Signed By: ${booking.user.parentName || "Guardian"}`, {
        x: 350,
        y: 125,
        size: 9,
        font,
      });

      page.drawText(`Date: ${formattedDate}`, {
        x: 350,
        y: 112,
        size: 9,
        font,
      });
    }
    const pdfBytes = await pdfDoc.save();

    const finalPath = path.join(
      __dirname,
      `../uploads/contracts/contract-${bookingId}.pdf`
    );

    fs.writeFileSync(finalPath, pdfBytes);

    await Contract.create({
      bookingId,
      signedPdfPath: finalPath,
      signedAt: signedAt,
    });

    booking.contractStatus = "SIGNED";
    await booking.save();

    await notifySecurityDeposit(booking);
    fs.unlinkSync(tenantSigPath);
    if (guardianSigPath) {
      fs.unlinkSync(guardianSigPath);
    }

    await mailsender(
      booking.user.email,
      "Your Signed Rental Agreement",
      "<p>Please find attached your signed rental agreement.</p>",
      [
        {
          filename: `contract-${bookingId}.pdf`,
          path: finalPath,
        }
      ]
    );
    const email = securityDepositPaymentEmail({
      userName: booking.user.fullName,
      propertyName: booking.room.property.name,
      bookingId: booking.id
    });

    await mailsender(
      booking.user.email,
      "Security Deposit Payment Required - Coco Living",
      email.html,
      email.attachments
    );
    return res.json({
      message: "Contract signed successfully",
      fileUrl: `/uploads/contracts/contract-${bookingId}.pdf`
    });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};