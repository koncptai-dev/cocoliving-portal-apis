const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const projectRoot = path.resolve(__dirname, "..");
const ExcelJS = require(path.join(projectRoot, "node_modules/exceljs"));
const sequelize = require(path.join(projectRoot, "src/config/database"));
const { Rooms, User, Booking } = require(path.join(
  projectRoot,
  "src/models"
));

const TARGET_PROPERTY_ID = 1;

function extractCellValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    if (val.text !== undefined) return val.text;
    if (val.result !== undefined) return val.result;
    if (val.richText) return val.richText.map((t) => t.text).join("");
    if (val.hyperlink) return val.text || val.hyperlink;
    return JSON.stringify(val);
  }
  return val;
}

function parseAmount(val) {
  if (val === null || val === undefined) return 0;
  const raw = extractCellValue(val);
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed.toLowerCase() === "without meal" ||
      trimmed.toLowerCase() === "included in rental"
    ) {
      return 0;
    }
    const cleaned = trimmed.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function sanitizePhone(val) {
  if (!val) return "";
  const raw = String(extractCellValue(val));
  return raw.replace(/[^0-9]/g, "");
}

function sanitizeEmail(val) {
  if (!val) return "";
  return String(extractCellValue(val)).trim().toLowerCase();
}

function normalizeName(name) {
  if (!name) return "";
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

class SheetLogger {
  constructor(filePath, sheetTitle) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `=== ${sheetTitle} Log (Property ID: ${TARGET_PROPERTY_ID}) ===\n\n`, "utf8");
  }

  log(message = "") {
    console.log(message);
    fs.appendFileSync(this.filePath, message + "\n", "utf8");
  }
}

async function verifyPastBookings() {
  const excelFilePath = path.join(
    projectRoot,
    "scripts/files/CoCo_Past_Bookings_Aug26.xlsx"
  );
  const logsDir = path.join(projectRoot, "scripts/logs");

  if (!fs.existsSync(excelFilePath)) {
    console.error(`Excel file not found: ${excelFilePath}`);
    process.exit(1);
  }

  await sequelize.authenticate();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelFilePath);

  // ============================================================================
  // SHEET 1: NON CEPT
  // ============================================================================
  const nonCeptSheet = workbook.getWorksheet("Non Cept ");
  if (nonCeptSheet) {
    const logFilePath = path.join(logsDir, "non_cept_verification.log");
    const logger = new SheetLogger(logFilePath, "Non Cept");

    const headers = [];
    nonCeptSheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(extractCellValue(cell.value) || "").trim();
    });

    let totalProcessed = 0;
    let roomNotFoundCount = 0;
    let userNotFoundCount = 0;
    let nameMismatchCount = 0;
    let realBookingsCount = 0;
    let deposit1Plus1Count = 0;
    let calcMatchCount = 0;
    let calcMismatchCount = 0;
    let amountMatchedCount = 0;

    for (let rowNumber = 2; rowNumber <= nonCeptSheet.rowCount; rowNumber++) {
      const row = nonCeptSheet.getRow(rowNumber);
      if (!row || !row.hasValues) continue;

      const rowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          rowData[header] = extractCellValue(cell.value);
        }
      });

      const residentName = String(rowData["Resident Name"] || "").trim();
      const roomNumberRaw = rowData["Room Number"] || rowData["Room Number "];
      const roomNumber = Number(roomNumberRaw) || roomNumberRaw;
      const email = sanitizeEmail(rowData["Resident Email"]);
      const phone = sanitizePhone(rowData["Resident Phone"]);

      if (!residentName && !email && !phone && !roomNumber) continue;

      totalProcessed++;

      logger.log(`Row ${rowNumber}: Resident: "${residentName}", Room: ${roomNumber}, Email: ${email || "N/A"}, Phone: ${phone || "N/A"}`);

      // 1. Check if room exists for Property ID 1
      const dbRoom = await Rooms.findOne({
        where: {
          roomNumber: Number(roomNumber) || 0,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      if (!dbRoom) {
        roomNotFoundCount++;
        logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found - Skipping row)\n`);
        continue;
      }
      logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): Yes (Room ID: ${dbRoom.id})`);

      // 2. Check if user exists with email / phone
      const userConditions = [];
      if (email) userConditions.push({ email });
      if (phone) userConditions.push({ phone });

      let dbUser = null;
      if (userConditions.length > 0) {
        dbUser = await User.findOne({ where: { [Op.or]: userConditions } });
      }

      if (!dbUser) {
        userNotFoundCount++;
        logger.log(`- User in DB: No (Email: ${email || "N/A"}, Phone: ${phone || "N/A"} - Skipping row)\n`);
        continue;
      }
      logger.log(`- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`);

      // 3. Cross check name
      const normExcelName = normalizeName(residentName);
      const normDbName = normalizeName(dbUser.fullName);
      if (normExcelName !== normDbName) {
        nameMismatchCount++;
        logger.log(`- Name check: MISMATCH (Excel: "${residentName}" != DB: "${dbUser.fullName}")`);
      } else {
        logger.log(`- Name check: MATCH`);
      }

      // 4. Check real booking in DB for this user and room
      const existingBooking = await Booking.findOne({
        where: {
          userId: dbUser.id,
          roomId: dbRoom.id,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      if (existingBooking) {
        realBookingsCount++;
        logger.log(`- Real booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`);
      } else {
        logger.log(`- Real booking in DB: No`);
      }

      // 5. Security deposit check
      const secDepositType = String(rowData["Security Deposit Type"] || "").trim();
      const totalAmountReceived = parseAmount(rowData["Total Amount Received"]);
      const waiveRent = parseAmount(rowData["Waive Current Month Rent"]);
      const secDepositAmt = parseAmount(rowData["Security Deposit Amount"]);
      const advRent1stMonth = parseAmount(rowData["Advance Rent Amount 1st Month Rental"]);
      const advRentLastMonth = parseAmount(rowData["Advance Rent Duration (Last Month of tenure )"]);
      const amcCharges = parseAmount(rowData["AMC Charges Amount"]);

      if (secDepositType.includes("1+1")) {
        deposit1Plus1Count++;
        logger.log(`- Security deposit type: 1+1 (Expecting 1+2 for 2 advance rent, not 1+1)`);
      } else {
        logger.log(`- Security deposit type: ${secDepositType || "1+2"}`);
      }

      // 6. Total amount calculation check
      const expectedTotalAmount = waiveRent + secDepositAmt + advRent1stMonth + advRentLastMonth + amcCharges;
      const isCalcMatch = Math.round(totalAmountReceived) === Math.round(expectedTotalAmount);

      if (isCalcMatch) {
        calcMatchCount++;
        logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRent1stMonth} + ${advRentLastMonth} + ${amcCharges})`);
      } else {
        calcMismatchCount++;
        logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount})`);
      }

      // 7. Booking with same total amount check
      const amountMatchedBooking = await Booking.findOne({
        where: {
          userId: dbUser.id,
          roomId: dbRoom.id,
          propertyId: TARGET_PROPERTY_ID,
          totalAmount: totalAmountReceived,
        },
      });

      if (amountMatchedBooking) {
        amountMatchedCount++;
        logger.log(`- Booking with matching total amount in DB: Yes (Booking ID: ${amountMatchedBooking.id}, Amount: ${amountMatchedBooking.totalAmount})\n`);
      } else {
        logger.log(`- Booking with matching total amount in DB: No\n`);
      }
    }

    logger.log(`--- Summary ---`);
    logger.log(`Total Rows Processed: ${totalProcessed}`);
    logger.log(`Skipped (Room not found): ${roomNotFoundCount}`);
    logger.log(`Skipped (User not found): ${userNotFoundCount}`);
    logger.log(`Name Mismatches: ${nameMismatchCount}`);
    logger.log(`Real Bookings Found: ${realBookingsCount}`);
    logger.log(`Security Deposit 1+1: ${deposit1Plus1Count}`);
    logger.log(`Calculation Matches: ${calcMatchCount}`);
    logger.log(`Calculation Mismatches: ${calcMismatchCount}`);
    logger.log(`Bookings Matching Total Amount: ${amountMatchedCount}\n`);
  }

  // ============================================================================
  // SHEET 2: CEPT
  // ============================================================================
  const ceptSheet = workbook.getWorksheet("Cept ");
  if (ceptSheet) {
    const logFilePath = path.join(logsDir, "cept_verification.log");
    const logger = new SheetLogger(logFilePath, "Cept");

    const headers = [];
    ceptSheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(extractCellValue(cell.value) || "").trim();
    });

    let totalProcessed = 0;
    let roomNotFoundCount = 0;
    let userNotFoundCount = 0;
    let nameMismatchCount = 0;
    let realBookingsCount = 0;
    let calcMatchCount = 0;
    let calcMismatchCount = 0;
    let amountMatchedCount = 0;

    for (let rowNumber = 2; rowNumber <= ceptSheet.rowCount; rowNumber++) {
      const row = ceptSheet.getRow(rowNumber);
      if (!row || !row.hasValues) continue;

      const rowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          rowData[header] = extractCellValue(cell.value);
        }
      });

      const residentName = String(rowData["Resident Name"] || "").trim();
      const roomNumberRaw = rowData["Room Number"] || rowData["Room Number "];
      const roomNumber = Number(roomNumberRaw) || roomNumberRaw;
      const email = sanitizeEmail(rowData["Resident Email"]);
      const phone = sanitizePhone(rowData["Resident Phone"]);

      if (!residentName && !email && !phone && !roomNumber) continue;

      totalProcessed++;

      logger.log(`Row ${rowNumber}: Resident: "${residentName}", Room: ${roomNumber}, Email: ${email || "N/A"}, Phone: ${phone || "N/A"}`);

      // 1. Check if room exists for Property ID 1
      const dbRoom = await Rooms.findOne({
        where: {
          roomNumber: Number(roomNumber) || 0,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      if (!dbRoom) {
        roomNotFoundCount++;
        logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found - Skipping row)\n`);
        continue;
      }
      logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): Yes (Room ID: ${dbRoom.id})`);

      // 2. Check if user exists with email / phone
      const userConditions = [];
      if (email) userConditions.push({ email });
      if (phone) userConditions.push({ phone });

      let dbUser = null;
      if (userConditions.length > 0) {
        dbUser = await User.findOne({ where: { [Op.or]: userConditions } });
      }

      if (!dbUser) {
        userNotFoundCount++;
        logger.log(`- User in DB: No (Email: ${email || "N/A"}, Phone: ${phone || "N/A"} - Skipping row)\n`);
        continue;
      }
      logger.log(`- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`);

      // 3. Cross check name
      const normExcelName = normalizeName(residentName);
      const normDbName = normalizeName(dbUser.fullName);
      if (normExcelName !== normDbName) {
        nameMismatchCount++;
        logger.log(`- Name check: MISMATCH (Excel: "${residentName}" != DB: "${dbUser.fullName}")`);
      } else {
        logger.log(`- Name check: MATCH`);
      }

      // 4. Check real booking in DB for this user and room
      const existingBooking = await Booking.findOne({
        where: {
          userId: dbUser.id,
          roomId: dbRoom.id,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      if (existingBooking) {
        realBookingsCount++;
        logger.log(`- Real booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`);
      } else {
        logger.log(`- Real booking in DB: No`);
      }

      // 5. CEPT total calculation check
      const totalAmountReceived = parseAmount(rowData["Total Amount Received"]);
      const waiveRent = parseAmount(rowData["Waive Current Month Rent"]);
      const secDepositAmt = parseAmount(rowData["Security Deposit Amount"]);
      const advRentAmt = parseAmount(rowData["Advance Rent Amount"]);
      const mealSubscriptionAmt = parseAmount(rowData["Meal Subscription Amount"]);
      const amcCharges = parseAmount(rowData["AMC Charges Amount"]);

      const expectedTotalAmount = waiveRent + secDepositAmt + advRentAmt + mealSubscriptionAmt + amcCharges;
      const isCalcMatch = Math.round(totalAmountReceived) === Math.round(expectedTotalAmount);

      if (isCalcMatch) {
        calcMatchCount++;
        logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRentAmt} + ${mealSubscriptionAmt} + ${amcCharges})`);
      } else {
        calcMismatchCount++;
        logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount})`);
      }

      // 6. Booking with same total amount check
      const amountMatchedBooking = await Booking.findOne({
        where: {
          userId: dbUser.id,
          roomId: dbRoom.id,
          propertyId: TARGET_PROPERTY_ID,
          totalAmount: totalAmountReceived,
        },
      });

      if (amountMatchedBooking) {
        amountMatchedCount++;
        logger.log(`- Booking with matching total amount in DB: Yes (Booking ID: ${amountMatchedBooking.id}, Amount: ${amountMatchedBooking.totalAmount})\n`);
      } else {
        logger.log(`- Booking with matching total amount in DB: No\n`);
      }
    }

    logger.log(`--- Summary ---`);
    logger.log(`Total Rows Processed: ${totalProcessed}`);
    logger.log(`Skipped (Room not found): ${roomNotFoundCount}`);
    logger.log(`Skipped (User not found): ${userNotFoundCount}`);
    logger.log(`Name Mismatches: ${nameMismatchCount}`);
    logger.log(`Real Bookings Found: ${realBookingsCount}`);
    logger.log(`Calculation Matches: ${calcMatchCount}`);
    logger.log(`Calculation Mismatches: ${calcMismatchCount}`);
    logger.log(`Bookings Matching Total Amount: ${amountMatchedCount}\n`);
  }

  await sequelize.close();
}

verifyPastBookings().catch((err) => {
  console.error("Error executing verification script:", err);
  process.exit(1);
});
