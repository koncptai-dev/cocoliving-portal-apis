const PDFDocument = require("pdfkit");

exports.generateAadhaarStylePDF = async (aadhaar, res) => {
  let kyc = {};
  try {
    kyc = JSON.parse(aadhaar.adharKycResponse || "{}");
  } catch {}

  const { dob, gender, name, country, dist, pc, state, street, vtc } = kyc;

  const cleanDate = aadhaar.verifiedAtAadhaar
    ? new Date(aadhaar.verifiedAtAadhaar).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="aadhaar-kyc-${aadhaar.userId}.pdf"`
  );
  doc.pipe(res);

  // ------- Header ------
  doc
    .fillColor("#FFB300")
    .fontSize(26)
    .text("Aadhaar e-KYC Details", { align: "center" });
  doc.moveDown(0.5);
  doc
    .strokeColor("#FFB300")
    .lineWidth(2)
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke();
  doc.moveDown(1.5);

  // ------- Content Box -------
  doc.roundedRect(50, doc.y, 500, 280, 10).strokeColor("#444").stroke();
  let y = doc.y + 15;

  const writeRow = (label, value) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#000")
      .text(label, 65, y);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#333")
      .text(value || "-", 230, y);
    y += 22;
  };

  writeRow("Full Name", name);
  writeRow("Date of Birth", dob);
  writeRow("Gender", gender);
  writeRow("Aadhaar Last 4 Digits", aadhaar.aadhaarLast4);
  writeRow("eKYC Status", aadhaar.ekycStatus);
  writeRow("Verified On", cleanDate);

  writeRow("Country", country);
  writeRow("State", state);
  writeRow("District", dist);
  writeRow("Pincode", pc);
  writeRow("Street", street);
  writeRow("VTC", vtc);

  // ------- Footer -------
  doc.moveDown(3.5);
  doc
    .fontSize(10)
    .fillColor("#777")
    .text(
      "This document is system-generated and valid only for KYC verification purposes.",
      {
        align: "center",
      }
    );

  doc.end();
};
