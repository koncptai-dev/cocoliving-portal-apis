const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// const Booking = require("../models/booking");

const Booking = require("../models/bookRoom");
const User = require("../models/user");
const { invoiceEmail } = require("./emailTemplates/emailTemplates");

const { sendEmail } = require("../utils/sendEmail");

async function generateAndSendInvoice(transaction) {
  try {
    const booking = await Booking.findOne({ where: { id: transaction.bookingId } });
    const user = await User.findOne({ where: { id: booking.userId } });

    const amount = transaction.amount / 100;

    const gst = amount * 0.05;
    const cgst = gst / 2;
    const sgst = gst / 2;
    const total = amount + gst;

    const invoiceNo = `INV-${transaction.id}`;
    const invoiceDate = new Date().toLocaleDateString("en-IN");

    const invoiceDir = path.join(__dirname, "../uploads/invoices");

    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const filePath = path.join(invoiceDir, `${invoiceNo}.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(fs.createWriteStream(filePath));

    /* HEADER */

    doc.fontSize(10).text("SUBJECT TO AHMEDABAD JURISDICTION", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(16).text("Tax Invoice", { align: "center" });

    doc.moveDown();

    doc.fontSize(12).text(`Invoice No: ${invoiceNo}`);
    doc.text(`Date: ${invoiceDate}`);

    doc.moveDown();

    /* COMPANY DETAILS */

    doc.fontSize(12).text("COLLAB COLONY PRIVATE LIMITED", {
      align: "center",
    });

    doc.fontSize(10).text(
      "9th Floor, Palak Prime, Iskon Ambli Road\nAhmedabad, Gujarat - 380058",
      { align: "center" }
    );

    doc.moveDown();

    /* CUSTOMER */

    doc.fontSize(12).text(`Party: ${user.fullName}`);
    doc.fontSize(10).text(user.address || "Ahmedabad");

    doc.moveDown();

    /* TABLE */

    doc.fontSize(11).text("Accommodation, Food and Beverage Services");

    doc.moveDown();

    doc.text(`Base Amount: ₹${amount.toFixed(2)}`);
    doc.text(`CGST 2.5%: ₹${cgst.toFixed(2)}`);
    doc.text(`SGST 2.5%: ₹${sgst.toFixed(2)}`);

    doc.moveDown();

    doc.fontSize(12).text(`Total: ₹${total.toFixed(2)}`, { align: "right" });

    doc.moveDown(3);

    doc.fontSize(10).text("This is a Computer Generated Invoice", {
      align: "center",
    });

    doc.end();

    /* SEND EMAIL */
    const template = invoiceEmail({
        userName: user.fullName,
        invoiceNo,
        amount,
        paymentDate: transaction.createdAt
      });

      await sendEmail({
        to: user.email,
        subject: `Invoice ${invoiceNo} - Coco Living`,
        html: template.html,
        attachments: [
          ...template.attachments,
          {
            filename: `${invoiceNo}.pdf`,
            path: invoicePath
          }
        ]
      });

    console.log("✅ Invoice generated and email sent");

    return true;
  } catch (error) {
    console.error("Invoice generation failed:", error);
  }
}

module.exports = { generateAndSendInvoice };