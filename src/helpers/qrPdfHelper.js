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
        margin: 5,
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

const addInventoryBlock = async (doc, inventory, x, y) => {
    const qrBuffer = await generateQrBuffer(buildQrText(inventory));

    doc.image(qrBuffer, x + 10, y + 5, {
        width: 150,
        height: 150
    });

    const centerX = x + 85;

    doc.font("Helvetica-Bold")
        .fontSize(10)
        .text(
            inventory.itemName,
            x,
            y + 155,
            {
                width: 170,
                align: "center"
            }
        );

    doc.font("Helvetica")
        .fontSize(9)
        .text(
            `SET-${inventory.setNumber || "-"}`,
            x,
            y + 170,
            {
                width: 170,
                align: "center"
            }
        );
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