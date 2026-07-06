const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const buildQrText = (inventory) => {
    return `Inventory Code : ${inventory.inventoryCode}
Item Name      : ${inventory.itemName}
Property       : ${inventory.property?.name || "N/A"}
Room Number    : ${inventory.room?.roomNumber || "Common Area"}`;
};

const generateQrBuffer = async (text) => {
    return await QRCode.toBuffer(text, {
        type: "png",
        margin: 1,
        width: 250,
        errorCorrectionLevel: "H"
    });
};

const createPdfDocument = (res, filename) => {
    const doc = new PDFDocument({
        margin: 40,
        size: "A4"
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
    );

    doc.pipe(res);

    return doc;
};

const addInventoryBlock = async (doc, inventory) => {

    const qrBuffer = await generateQrBuffer(buildQrText(inventory));

    const startY = doc.y;

    // QR
    doc.image(qrBuffer, 50, startY, {
        width: 150,
        height: 150
    });

    // Details
    const x = 230;
    let y = startY;

    doc.font("Helvetica-Bold")
        .fontSize(18)
        .text("Inventory Details", x, y);

    y += 35;

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Inventory Code :", x, y, { continued: true });
    doc.font("Helvetica").text(` ${inventory.inventoryCode}`);

    y += 22;

    doc.font("Helvetica-Bold");
    doc.text("Item Name :", x, y, { continued: true });
    doc.font("Helvetica").text(` ${inventory.itemName}`);

    y += 22;

    doc.font("Helvetica-Bold");
    doc.text("Room Number :", x, y, { continued: true });
    doc.font("Helvetica").text(` ${inventory.room?.roomNumber ?? "Common Area"}`);

    y += 22;

    doc.font("Helvetica-Bold");
    doc.text("Property :", x, y, { continued: true });
    doc.font("Helvetica").text(` ${inventory.property?.name ?? "N/A"}`);

    doc.y = Math.max(startY + 170, doc.y) + 20;

    doc.moveTo(40, doc.y)
       .lineTo(555, doc.y)
       .stroke();

    doc.moveDown();
};

const propertyFilename = (propertyName) => {

    const now = new Date();

    const formatted =
        `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;

    return `${propertyName}_${formatted}.pdf`;
};

module.exports = {
    buildQrText,
    generateQrBuffer,
    createPdfDocument,
    addInventoryBlock,
    propertyFilename
};