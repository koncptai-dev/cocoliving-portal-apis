const QRCode = require("qrcode");
const sharp = require("sharp");

const buildQrText = (inventory) => {
    return `Inventory Code : ${inventory.inventoryCode}
Item Name      : ${inventory.itemName}
Property       : ${inventory.property?.name || "N/A"}
Room Number    : ${inventory.room?.roomNumber || "Property Pool"}`;
};

const generateQrBuffer = async (text) => {
    return await QRCode.toBuffer(text, {
        type: "png",
        margin: 1,
        width: 280,
        errorCorrectionLevel: "H"
    });
};

const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const splitText = (value, maxChars = 28) => {
    const words = String(value || "").trim().split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
        const nextLine = line ? `${line} ${word}` : word;
        if (line && nextLine.length > maxChars) {
            lines.push(line);
            line = word;
        } else {
            line = nextLine;
        }
    }

    if (line) lines.push(line);
    return lines.slice(0, 2);
};

const createInventoryLabel = async (inventory) => {
    const qrBuffer = await generateQrBuffer(buildQrText(inventory));
    const roomNumber = inventory.room?.roomNumber || "Property Pool";
    const itemLines = splitText(inventory.itemName);
    const hasSetNumber = inventory.setNumber !== null &&
        inventory.setNumber !== undefined &&
        String(inventory.setNumber).trim() !== "";
    const itemY = hasSetNumber ? 390 : 410;
    const itemText = itemLines.map((line, index) =>
        `<text x="250" y="${itemY + index * 24}" class="item">${escapeXml(line)}</text>`
    ).join("");
    const setText = hasSetNumber
        ? `<text x="250" y="466" class="set">SET-${escapeXml(inventory.setNumber)}</text>`
        : "";

    const overlay = Buffer.from(`
        <svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
            <style>
                .room { fill: #111827; font-family: Arial, sans-serif; font-size: 24px; font-weight: 700; text-anchor: middle; }
                .item { fill: #111827; font-family: Arial, sans-serif; font-size: 21px; font-weight: 700; text-anchor: middle; }
                .set { fill: #374151; font-family: Arial, sans-serif; font-size: 18px; font-weight: 400; text-anchor: middle; }
            </style>
            <rect width="500" height="500" fill="#ffffff"/>
            <text x="250" y="44" class="room">Room ${escapeXml(roomNumber)}</text>
            ${itemText}
            ${setText}
        </svg>
    `);

    return sharp({
        create: {
            width: 500,
            height: 500,
            channels: 4,
            background: "#ffffff"
        }
    })
        .composite([
            { input: overlay },
            { input: qrBuffer, left: 110, top: 75 }
        ])
        .png()
        .toBuffer();
};

module.exports = {
    buildQrText,
    generateQrBuffer,
    createInventoryLabel
};
