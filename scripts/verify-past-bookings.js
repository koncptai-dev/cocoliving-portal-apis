const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const projectRoot = path.resolve(__dirname, "..");
const ExcelJS = require(path.join(projectRoot, "node_modules/exceljs"));
const sequelize = require(path.join(projectRoot, "src/config/database"));
const { Rooms, User, Booking, PaymentTransaction } = require(path.join(
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

function formatSummaryLine(label, rowList) {
  const count = rowList.length;
  if (count === 0) {
    return `${label}: 0`;
  }
  return `${label}: ${count} (Rows: ${rowList.join(", ")})`;
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
    "scripts/files/CoCo Past Bookings Aug26 v1.1.xlsx"
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
    const skippedRoomRows = [];
    const skippedUserRows = [];
    const skippedBookingRows = [];
    const bookingDataMismatchRows = [];
    const nameMismatchRows = [];
    const approvedBookingFoundRows = [];
    const deposit1Plus1Rows = [];
    const calcMatchRows = [];
    const calcMismatchRows = [];
    const paymentMatchedRows = [];
    const paymentNotMatchedRows = [];
    const finalClassificationRows = [];

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
        skippedRoomRows.push(rowNumber);
        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: null,
          dbUserName: null,
          bookingId: null,
          bookingStatus: null,
          classification: "ROOM_NOT_FOUND",
          calculation: "NOT_CHECKED",
          payment: "NOT_CHECKED",
        });
        logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found)`);
        logger.log(`- Final classification: ROOM_NOT_FOUND\n`);
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
        skippedUserRows.push(rowNumber);
        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: null,
          dbUserName: null,
          bookingId: null,
          bookingStatus: null,
          classification: "USER_NOT_FOUND",
          calculation: "NOT_CHECKED",
          payment: "NOT_CHECKED",
        });
        logger.log(`- User in DB: No (Email: ${email || "N/A"}, Phone: ${phone || "N/A"})`);
        logger.log(`- Final classification: USER_NOT_FOUND\n`);
        continue;
      }
      logger.log(`- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`);

      // 3. Cross check name
      const normExcelName = normalizeName(residentName);
      const normDbName = normalizeName(dbUser.fullName);
      if (normExcelName !== normDbName) {
        nameMismatchRows.push(rowNumber);
        logger.log(`- Name check: MISMATCH (Excel: "${residentName}" != DB: "${dbUser.fullName}")`);
      } else {
        logger.log(`- Name check: MATCH`);
      }

      // 4. Check real booking in DB with status: 'approved'
      const userBookings = await Booking.findAll({
        where: {
          userId: dbUser.id,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      const existingBooking = userBookings.find(
        (booking) =>
          Number(booking.roomId) === Number(dbRoom.id) &&
          String(booking.status || "").toLowerCase() === "approved"
      );

      if (!existingBooking) {
        const classification =
          userBookings.length === 0
            ? "BOOKING_NOT_FOUND"
            : "BOOKING_DATA_MISMATCH";

        if (classification === "BOOKING_NOT_FOUND") {
          skippedBookingRows.push(rowNumber);

          finalClassificationRows.push({
            rowNumber,
            residentName,
            roomNumber,
            userId: dbUser.id,
            dbUserName: dbUser.fullName,
            bookingId: null,
            bookingStatus: null,
            classification,
            calculation: "NOT_CHECKED",
            payment: "NOT_CHECKED",
          });

          logger.log(`- User bookings in DB for Property ID ${TARGET_PROPERTY_ID}: 0`);
          logger.log(`- Real approved booking in DB for Excel Room ID ${dbRoom.id}: No`);
          logger.log(`- Final classification: ${classification}\n`);
          continue;
        }

        bookingDataMismatchRows.push(rowNumber);

        logger.log(`- User bookings in DB for Property ID ${TARGET_PROPERTY_ID}: ${userBookings.length}`);

        for (const booking of userBookings) {
          const actualRoom = await Rooms.findByPk(booking.roomId);
          logger.log(`  - Booking ID: ${booking.id}, Room ID: ${booking.roomId}, Room Number: ${actualRoom?.roomNumber ?? "N/A"}, Status: ${booking.status}, Total Amount: ${booking.totalAmount ?? "N/A"}`);
        }

        const totalAmountReceived = parseAmount(rowData["Total Amount Received"]);
        const waiveRent = parseAmount(rowData["Waive Current Month Rent"]);
        const secDepositAmt = parseAmount(rowData["Security Deposit Amount"]);
        const advRent1stMonth = parseAmount(rowData["Advance Rent Amount 1st Month Rental"]);
        const advRentLastMonth = parseAmount(rowData["Advance Rent Duration (Last Month of tenure )"]);
        const amcCharges = parseAmount(rowData["AMC Charges Amount"]);

        const expectedTotalAmount = waiveRent + secDepositAmt + advRent1stMonth + advRentLastMonth + amcCharges;
        const isCalcMatch = Math.round(totalAmountReceived) === Math.round(expectedTotalAmount);

        if (isCalcMatch) {
          calcMatchRows.push(rowNumber);
          logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRent1stMonth} + ${advRentLastMonth} + ${amcCharges})`);
        } else {
          calcMismatchRows.push(rowNumber);
          logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount}, Difference: ${totalAmountReceived - expectedTotalAmount})`);
        }

        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: dbUser.id,
          dbUserName: dbUser.fullName,
          bookingId: null,
          bookingStatus: null,
          classification,
          calculation: isCalcMatch ? "MATCH" : "MISMATCH",
          totalAmountReceived,
          calculatedAmount: expectedTotalAmount,
          difference: totalAmountReceived - expectedTotalAmount,
          payment: "NOT_CHECKED",
        });

        logger.log(`- Payment check: NOT_CHECKED (Booking data mismatch - payment lookup not performed)`);
        logger.log(`- Final classification: ${classification}\n`);
        continue;
      }

      approvedBookingFoundRows.push(rowNumber);
      logger.log(`- Real approved booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`);

      // 5. Security deposit check
      const secDepositType = String(rowData["Security Deposit Type"] || "").trim();
      const totalAmountReceived = parseAmount(rowData["Total Amount Received"]);
      const waiveRent = parseAmount(rowData["Waive Current Month Rent"]);
      const secDepositAmt = parseAmount(rowData["Security Deposit Amount"]);
      const advRent1stMonth = parseAmount(rowData["Advance Rent Amount 1st Month Rental"]);
      const advRentLastMonth = parseAmount(rowData["Advance Rent Duration (Last Month of tenure )"]);
      const amcCharges = parseAmount(rowData["AMC Charges Amount"]);

      if (secDepositType.includes("1+1")) {
        deposit1Plus1Rows.push(rowNumber);
        logger.log(`- Security deposit type: 1+1 (Expecting 1+2 for 2 advance rent, not 1+1)`);
      } else {
        logger.log(`- Security deposit type: ${secDepositType || "1+2"}`);
      }

      // 6. Total amount calculation check
      const expectedTotalAmount = waiveRent + secDepositAmt + advRent1stMonth + advRentLastMonth + amcCharges;
      const isCalcMatch = Math.round(totalAmountReceived) === Math.round(expectedTotalAmount);

      if (isCalcMatch) {
        calcMatchRows.push(rowNumber);
        logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRent1stMonth} + ${advRentLastMonth} + ${amcCharges})`);
      } else {
        calcMismatchRows.push(rowNumber);
        logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount})`);
      }

      // 7. Check which Payment Transaction row for this booking has this total amount
      const paymentTransactions = await PaymentTransaction.findAll({
        where: { bookingId: existingBooking.id },
      });

      const matchingTx = paymentTransactions.find((tx) => {
        const txTotalReceived = Number(tx.totalAmountReceived);
        const txAmountRupees = Math.round(Number(tx.amount) / 100);
        const txAmountRaw = Number(tx.amount);
        return (
          txTotalReceived === totalAmountReceived ||
          txAmountRupees === totalAmountReceived ||
          txAmountRaw === totalAmountReceived
        );
      });

      logger.log(`- Payment transactions found for Booking ID ${existingBooking.id}: ${paymentTransactions.length}`);

      for (const tx of paymentTransactions) {
        const txAmountDisplay = tx.totalAmountReceived ?? (Number(tx.amount) / 100);
        logger.log(`  - Payment ID: ${tx.id}, Type: ${tx.type}, Status: ${tx.status}, Total Amount Received: ₹${txAmountDisplay}, Amount: ${tx.amount ?? "N/A"}, Mode: ${tx.paymentMode || "N/A"}`);
      }

      if (matchingTx) {
        paymentMatchedRows.push(rowNumber);
        const amountDisplay = matchingTx.totalAmountReceived ?? (matchingTx.amount / 100);
        logger.log(`- Payment matching Excel total: Found (Payment ID: ${matchingTx.id}, Total Amount Received: ₹${amountDisplay})`);
      } else {
        paymentNotMatchedRows.push(rowNumber);
        logger.log(`- Payment matching Excel total: Not Found (Expected: ₹${totalAmountReceived})`);
      }
      let classification;

      if (!isCalcMatch) {
        classification = "CALCULATION_MISMATCH";
      } else if (paymentTransactions.length === 0) {
        classification = "PAYMENT_NOT_FOUND";
      } else if (!matchingTx) {
        classification = "PAYMENT_AMOUNT_MISMATCH";
      } else {
        classification = "VERIFIED";
      }

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: dbUser.id,
        dbUserName: dbUser.fullName,
        bookingId: existingBooking.id,
        bookingStatus: existingBooking.status,
        securityDepositType: secDepositType,
        totalAmountReceived,
        calculatedAmount: expectedTotalAmount,
        difference: totalAmountReceived - expectedTotalAmount,
        classification,
        calculation: isCalcMatch ? "MATCH" : "MISMATCH",
        payment: matchingTx
          ? "FOUND"
          : paymentTransactions.length === 0
            ? "NOT_FOUND"
            : "AMOUNT_NOT_MATCHED",
        paymentId: matchingTx ? matchingTx.id : null,
        paymentTransactions: paymentTransactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          status: tx.status,
          totalAmountReceived: tx.totalAmountReceived,
          amount: tx.amount,
          paymentMode: tx.paymentMode,
        })),
      });

      logger.log(`- Final classification: ${classification}\n`);
    }

    logger.log(`--- Summary ---`);
    logger.log(`Total Rows Processed: ${totalProcessed}`);
    logger.log(formatSummaryLine(`User Not Found`, finalClassificationRows.filter((r) => r.classification === "USER_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Booking Not Found`, finalClassificationRows.filter((r) => r.classification === "BOOKING_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Booking Data Mismatch`, finalClassificationRows.filter((r) => r.classification === "BOOKING_DATA_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Calculation Mismatch`, finalClassificationRows.filter((r) => r.classification === "CALCULATION_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Payment Not Found`, finalClassificationRows.filter((r) => r.classification === "PAYMENT_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Payment Amount Mismatch`, finalClassificationRows.filter((r) => r.classification === "PAYMENT_AMOUNT_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Verified`, finalClassificationRows.filter((r) => r.classification === "VERIFIED").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Room Not Found`, finalClassificationRows.filter((r) => r.classification === "ROOM_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(`Name Mismatches: ${nameMismatchRows.length}`);
    logger.log(formatSummaryLine(`Security Deposit 1+1 Flagged`, deposit1Plus1Rows));
    logger.log("");
    logger.log(`--- Classified Data ---`);

    for (const classification of [
      "USER_NOT_FOUND",
      "BOOKING_NOT_FOUND",
      "BOOKING_DATA_MISMATCH",
      "CALCULATION_MISMATCH",
      "PAYMENT_NOT_FOUND",
      "PAYMENT_AMOUNT_MISMATCH",
      "VERIFIED",
      "ROOM_NOT_FOUND",
    ]) {
      const rows = finalClassificationRows.filter(
        (r) => r.classification === classification
      );

      logger.log(`### ${classification} (${rows.length})`);

      for (const r of rows) {
        logger.log(
          `Row=${r.rowNumber} | Resident="${r.residentName}" | Room=${r.roomNumber} | UserID=${r.userId ?? "N/A"} | DBName="${r.dbUserName ?? "N/A"}" | BookingID=${r.bookingId ?? "N/A"} | Status=${r.bookingStatus ?? "N/A"} | Received=${r.totalAmountReceived ?? "N/A"} | Calculated=${r.calculatedAmount ?? "N/A"} | Difference=${r.difference ?? "N/A"} | Calculation=${r.calculation} | Payment=${r.payment} | PaymentID=${r.paymentId ?? "N/A"} | Payments=${r.paymentTransactions ? r.paymentTransactions.map((p) => `ID:${p.id},Total:${p.totalAmountReceived ?? "N/A"},Amount:${p.amount ?? "N/A"},Status:${p.status ?? "N/A"},Type:${p.type ?? "N/A"},Mode:${p.paymentMode ?? "N/A"}`).join(" || ") : "NOT_CHECKED"}`
        );
      }

      logger.log("");
    }
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
    const skippedRoomRows = [];
    const skippedUserRows = [];
    const skippedBookingRows = [];
    const bookingDataMismatchRows = [];
    const nameMismatchRows = [];
    const approvedBookingFoundRows = [];
    const calcMatchRows = [];
    const calcMismatchRows = [];
    const paymentMatchedRows = [];
    const paymentNotMatchedRows = [];
    const finalClassificationRows = [];

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
        skippedRoomRows.push(rowNumber);
        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: null,
          dbUserName: null,
          bookingId: null,
          bookingStatus: null,
          classification: "ROOM_NOT_FOUND",
          calculation: "NOT_CHECKED",
          payment: "NOT_CHECKED",
        });
        logger.log(`- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found)`);
        logger.log(`- Final classification: ROOM_NOT_FOUND\n`);
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
        skippedUserRows.push(rowNumber);
        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: null,
          dbUserName: null,
          bookingId: null,
          bookingStatus: null,
          classification: "USER_NOT_FOUND",
          calculation: "NOT_CHECKED",
          payment: "NOT_CHECKED",
        });
        logger.log(`- User in DB: No (Email: ${email || "N/A"}, Phone: ${phone || "N/A"})`);
        logger.log(`- Final classification: USER_NOT_FOUND\n`);
        continue;
      }
      logger.log(`- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`);

      // 3. Cross check name
      const normExcelName = normalizeName(residentName);
      const normDbName = normalizeName(dbUser.fullName);
      if (normExcelName !== normDbName) {
        nameMismatchRows.push(rowNumber);
        logger.log(`- Name check: MISMATCH (Excel: "${residentName}" != DB: "${dbUser.fullName}")`);
      } else {
        logger.log(`- Name check: MATCH`);
      }

      // 4. Check real booking in DB with status: 'approved'
      // 4. Check real booking in DB with status: 'approved'
      const userBookings = await Booking.findAll({
        where: {
          userId: dbUser.id,
          propertyId: TARGET_PROPERTY_ID,
        },
      });

      const existingBooking = userBookings.find(
        (booking) =>
          Number(booking.roomId) === Number(dbRoom.id) &&
          String(booking.status || "").toLowerCase() === "approved"
      );

      if (!existingBooking) {
        const classification =
          userBookings.length === 0
            ? "BOOKING_NOT_FOUND"
            : "BOOKING_DATA_MISMATCH";

        if (classification === "BOOKING_NOT_FOUND") {
          skippedBookingRows.push(rowNumber);

          finalClassificationRows.push({
            rowNumber,
            residentName,
            roomNumber,
            userId: dbUser.id,
            dbUserName: dbUser.fullName,
            bookingId: null,
            bookingStatus: null,
            classification,
            calculation: "NOT_CHECKED",
            payment: "NOT_CHECKED",
          });

          logger.log(`- User bookings found for Property ID ${TARGET_PROPERTY_ID}: 0`);
          logger.log(`- Real approved booking in DB for Excel Room ID ${dbRoom.id}: No`);
          logger.log(`- Final classification: ${classification}\n`);
          continue;
        }

        bookingDataMismatchRows.push(rowNumber);

        logger.log(`- User bookings found for Property ID ${TARGET_PROPERTY_ID}: ${userBookings.length}`);

        for (const booking of userBookings) {
          const actualRoom = await Rooms.findByPk(booking.roomId);
          logger.log(`  - Booking ID: ${booking.id}, Room ID: ${booking.roomId}, Room Number: ${actualRoom?.roomNumber ?? "N/A"}, Status: ${booking.status}, Total Amount: ${booking.totalAmount ?? "N/A"}`);
        }

        const totalAmountReceived = parseAmount(rowData["Total Amount Received"]);
        const waiveRent = parseAmount(rowData["Waive Current Month Rent"]);
        const secDepositAmt = parseAmount(rowData["Security Deposit Amount"]);
        const advRentAmt = parseAmount(rowData["Advance Rent Amount"]);
        const mealSubscriptionAmt = parseAmount(rowData["Meal Subscription Amount"]);
        const amcCharges = parseAmount(rowData["AMC Charges Amount"]);

        const expectedTotalAmount = waiveRent + secDepositAmt + advRentAmt + mealSubscriptionAmt + amcCharges;
        const isCalcMatch = Math.round(totalAmountReceived) === Math.round(expectedTotalAmount);

        if (isCalcMatch) {
          calcMatchRows.push(rowNumber);
          logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRentAmt} + ${mealSubscriptionAmt} + ${amcCharges})`);
        } else {
          calcMismatchRows.push(rowNumber);
          logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount}, Difference: ${totalAmountReceived - expectedTotalAmount})`);
        }

        finalClassificationRows.push({
          rowNumber,
          residentName,
          roomNumber,
          userId: dbUser.id,
          dbUserName: dbUser.fullName,
          bookingId: null,
          bookingStatus: null,
          classification,
          calculation: isCalcMatch ? "MATCH" : "MISMATCH",
          totalAmountReceived,
          calculatedAmount: expectedTotalAmount,
          difference: totalAmountReceived - expectedTotalAmount,
          payment: "NOT_CHECKED",
        });

        logger.log(`- Payment check: NOT_CHECKED (Booking data mismatch - payment lookup not performed)`);
        logger.log(`- Final classification: ${classification}\n`);
        continue;
      }

      approvedBookingFoundRows.push(rowNumber);
      logger.log(`- Real approved booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`);

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
        calcMatchRows.push(rowNumber);
        logger.log(`- Total amount calculation: MATCH (${totalAmountReceived} == ${waiveRent} + ${secDepositAmt} + ${advRentAmt} + ${mealSubscriptionAmt} + ${amcCharges})`);
      } else {
        calcMismatchRows.push(rowNumber);
        logger.log(`- Total amount calculation: MISMATCH (Received: ${totalAmountReceived}, Calculated: ${expectedTotalAmount})`);
      }

      // 6. Check which Payment Transaction row for this booking has this total amount
      const paymentTransactions = await PaymentTransaction.findAll({
        where: { bookingId: existingBooking.id },
      });

      const matchingTx = paymentTransactions.find((tx) => {
        const txTotalReceived = Number(tx.totalAmountReceived);
        const txAmountRupees = Math.round(Number(tx.amount) / 100);
        const txAmountRaw = Number(tx.amount);
        return (
          txTotalReceived === totalAmountReceived ||
          txAmountRupees === totalAmountReceived ||
          txAmountRaw === totalAmountReceived
        );
      });

      logger.log(`- Payment transactions found for Booking ID ${existingBooking.id}: ${paymentTransactions.length}`);

      for (const tx of paymentTransactions) {
        const txAmountDisplay = tx.totalAmountReceived ?? (Number(tx.amount) / 100);
        logger.log(`  - Payment ID: ${tx.id}, Type: ${tx.type}, Status: ${tx.status}, Total Amount Received: ₹${txAmountDisplay}, Amount: ${tx.amount ?? "N/A"}, Mode: ${tx.paymentMode || "N/A"}`);
      }

      if (matchingTx) {
        paymentMatchedRows.push(rowNumber);
        const amountDisplay = matchingTx.totalAmountReceived ?? (matchingTx.amount / 100);
        logger.log(`- Payment matching Excel total: Found (Payment ID: ${matchingTx.id}, Total Amount Received: ₹${amountDisplay})`);
      } else {
        paymentNotMatchedRows.push(rowNumber);
        logger.log(`- Payment matching Excel total: Not Found (Expected: ₹${totalAmountReceived})`);
      }
      let classification;

      if (!isCalcMatch) {
        classification = "CALCULATION_MISMATCH";
      } else if (paymentTransactions.length === 0) {
        classification = "PAYMENT_NOT_FOUND";
      } else if (!matchingTx) {
        classification = "PAYMENT_AMOUNT_MISMATCH";
      } else {
        classification = "VERIFIED";
      }

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: dbUser.id,
        dbUserName: dbUser.fullName,
        bookingId: existingBooking.id,
        bookingStatus: existingBooking.status,
        totalAmountReceived,
        calculatedAmount: expectedTotalAmount,
        difference: totalAmountReceived - expectedTotalAmount,
        classification,
        calculation: isCalcMatch ? "MATCH" : "MISMATCH",
        payment: matchingTx
          ? "FOUND"
          : paymentTransactions.length === 0
            ? "NOT_FOUND"
            : "AMOUNT_NOT_MATCHED",
        paymentId: matchingTx ? matchingTx.id : null,
        paymentTransactions: paymentTransactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          status: tx.status,
          totalAmountReceived: tx.totalAmountReceived,
          amount: tx.amount,
          paymentMode: tx.paymentMode,
        })),
      });

      logger.log(`- Final classification: ${classification}\n`);
    }

    logger.log(`--- Summary ---`);
    logger.log(`Total Rows Processed: ${totalProcessed}`);
    logger.log(formatSummaryLine(`User Not Found`, finalClassificationRows.filter((r) => r.classification === "USER_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Booking Not Found`, finalClassificationRows.filter((r) => r.classification === "BOOKING_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Booking Data Mismatch`, finalClassificationRows.filter((r) => r.classification === "BOOKING_DATA_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Calculation Mismatch`, finalClassificationRows.filter((r) => r.classification === "CALCULATION_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Payment Not Found`, finalClassificationRows.filter((r) => r.classification === "PAYMENT_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Payment Amount Mismatch`, finalClassificationRows.filter((r) => r.classification === "PAYMENT_AMOUNT_MISMATCH").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Verified`, finalClassificationRows.filter((r) => r.classification === "VERIFIED").map((r) => r.rowNumber)));
    logger.log(formatSummaryLine(`Room Not Found`, finalClassificationRows.filter((r) => r.classification === "ROOM_NOT_FOUND").map((r) => r.rowNumber)));
    logger.log(`Name Mismatches: ${nameMismatchRows.length}`);
    logger.log("");
    logger.log(`--- Classified Data ---`);

    for (const classification of [
      "USER_NOT_FOUND",
      "BOOKING_NOT_FOUND",
      "BOOKING_DATA_MISMATCH",
      "CALCULATION_MISMATCH",
      "PAYMENT_NOT_FOUND",
      "PAYMENT_AMOUNT_MISMATCH",
      "VERIFIED",
      "ROOM_NOT_FOUND",
    ]) {
      const rows = finalClassificationRows.filter(
        (r) => r.classification === classification
      );

      logger.log(`### ${classification} (${rows.length})`);

      for (const r of rows) {
        logger.log(
          `Row=${r.rowNumber} | Resident="${r.residentName}" | Room=${r.roomNumber} | UserID=${r.userId ?? "N/A"} | DBName="${r.dbUserName ?? "N/A"}" | BookingID=${r.bookingId ?? "N/A"} | Status=${r.bookingStatus ?? "N/A"} | Received=${r.totalAmountReceived ?? "N/A"} | Calculated=${r.calculatedAmount ?? "N/A"} | Difference=${r.difference ?? "N/A"} | Calculation=${r.calculation} | Payment=${r.payment} | PaymentID=${r.paymentId ?? "N/A"} | Payments=${r.paymentTransactions ? r.paymentTransactions.map((p) => `ID:${p.id},Total:${p.totalAmountReceived ?? "N/A"},Amount:${p.amount ?? "N/A"},Status:${p.status ?? "N/A"},Type:${p.type ?? "N/A"},Mode:${p.paymentMode ?? "N/A"}`).join(" || ") : "NOT_CHECKED"}`
        );
      }

      logger.log("");
    }
  }

  await sequelize.close();
}

verifyPastBookings().catch((err) => {
  console.error("Error executing verification script:", err);
  process.exit(1);
});
