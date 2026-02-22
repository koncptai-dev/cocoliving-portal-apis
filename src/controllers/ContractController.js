const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { Booking, User, Rooms, Property, Contract } = require("../models");
const { mailsender } = require("../utils/emailService");

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

    if (!req.file)
      return res.status(400).json({ message: "Signature file required" });

    const pdfDoc = await generateBasePdf(booking);

    const signatureImageBytes = fs.readFileSync(req.file.path);
    const pngImage = await pdfDoc.embedPng(signatureImageBytes);

    
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

    page.drawText(`Digitally Signed By: ${booking.user.fullName}`, {
      x: 350,
      y: 210,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(`Date: ${formattedDate}`, {
      x: 350,
      y: 195,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawImage(pngImage, {
      x: 350,
      y: 120,
      width: 160,
      height: 60,
    });

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

    fs.unlinkSync(req.file.path);

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

    return res.json({
      message: "Contract signed successfully",
      fileUrl: `/uploads/contracts/contract-${bookingId}.pdf`
    });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};