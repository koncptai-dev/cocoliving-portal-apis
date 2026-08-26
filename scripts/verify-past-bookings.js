const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");

const projectRoot = path.resolve(__dirname, "..");
const ExcelJS = require(path.join(projectRoot, "node_modules/exceljs"));
const sequelize = require(path.join(projectRoot, "src/config/database"));
const {
  Rooms,
  User,
  Booking,
  PaymentTransaction,
} = require(path.join(projectRoot, "src/models"));

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

  if (typeof raw === "number") {
    return Number.isNaN(raw) ? 0 : raw;
  }

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

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function sanitizePhone(val) {
  if (!val) return "";
  return String(extractCellValue(val)).replace(/[^0-9]/g, "");
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
  if (rowList.length === 0) {
    return `${label}: 0`;
  }

  return `${label}: ${rowList.length} (Rows: ${rowList.join(", ")})`;
}

class SheetLogger {
  constructor(filePath, sheetTitle) {
    this.filePath = filePath;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(
      this.filePath,
      `=== ${sheetTitle} Log (Property ID: ${TARGET_PROPERTY_ID}) ===\n\n`,
      "utf8"
    );
  }

  log(message = "") {
    console.log(message);
    fs.appendFileSync(this.filePath, message + "\n", "utf8");
  }
}

function calculateNonCeptAmounts(rowData) {
  const totalAmountReceived = parseAmount(
    rowData["Total Amount Received"]
  );

  const waiveRent = parseAmount(
    rowData["Waive Current Month Rent"]
  );

  const secDepositAmt = parseAmount(
    rowData["Security Deposit Amount"]
  );

  const advRent1stMonth = parseAmount(
    rowData["Advance Rent Amount 1st Month Rental"]
  );

  const advRentLastMonth = parseAmount(
    rowData["Advance Rent Duration (Last Month of tenure )"]
  );

  const amcCharges = parseAmount(
    rowData["AMC Charges Amount"]
  );

  const calculatedTotal =
    waiveRent +
    secDepositAmt +
    advRent1stMonth +
    advRentLastMonth +
    amcCharges;

  return {
    totalAmountReceived,
    calculatedTotal,
    difference: totalAmountReceived - calculatedTotal,
    isMatch:
      Math.round(totalAmountReceived) === Math.round(calculatedTotal),
  };
}

function calculateCeptAmounts(rowData) {
  const totalAmountReceived = parseAmount(
    rowData["Total Amount Received"]
  );

  const waiveRent = parseAmount(
    rowData["Waive Current Month Rent"]
  );

  const secDepositAmt = parseAmount(
    rowData["Security Deposit Amount"]
  );

  const advRentAmt = parseAmount(
    rowData["Advance Rent Amount"]
  );

  const mealSubscriptionAmt = parseAmount(
    rowData["Meal Subscription Amount"]
  );

  const amcCharges = parseAmount(
    rowData["AMC Charges Amount"]
  );

  const calculatedTotal =
    waiveRent +
    secDepositAmt +
    advRentAmt +
    mealSubscriptionAmt +
    amcCharges;

  return {
    totalAmountReceived,
    calculatedTotal,
    difference: totalAmountReceived - calculatedTotal,
    isMatch:
      Math.round(totalAmountReceived) === Math.round(calculatedTotal),
  };
}

async function getPaymentTransactions(bookingId) {
  return PaymentTransaction.findAll({
    where: {
      bookingId,
    },
  });
}

function paymentDisplayAmount(tx) {
  if (
    tx.totalAmountReceived !== null &&
    tx.totalAmountReceived !== undefined
  ) {
    return Number(tx.totalAmountReceived);
  }

  const amount = Number(tx.amount);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount / 100);
}

function findMatchingPayment(paymentTransactions, excelTotal) {
  return paymentTransactions.find((tx) => {
    const txTotalReceived = Number(tx.totalAmountReceived);
    const txAmountRupees = Math.round(Number(tx.amount) / 100);
    const txAmountRaw = Number(tx.amount);

    return (
      txTotalReceived === excelTotal ||
      txAmountRupees === excelTotal ||
      txAmountRaw === excelTotal
    );
  });
}

function logPaymentTransactions(logger, paymentTransactions) {
  logger.log(
    `- Payment transactions found for booking: ${paymentTransactions.length}`
  );

  if (paymentTransactions.length === 0) {
    logger.log("- Payment rows for this booking: NONE");
    return;
  }

  for (const tx of paymentTransactions) {
    logger.log(
      `  - Payment ID: ${tx.id}, Type: ${tx.type ?? "N/A"}, Status: ${
        tx.status ?? "N/A"
      }, Total Amount Received: ₹${
        paymentDisplayAmount(tx) ?? "N/A"
      }, Amount: ${tx.amount ?? "N/A"}, Mode: ${
        tx.paymentMode ?? "N/A"
      }`
    );
  }
}

function classifyBookingPayment({
  calculationMatches,
  paymentTransactions,
  matchingTx,
}) {
  if (!calculationMatches) {
    return "CALCULATION_MISMATCH";
  }

  if (paymentTransactions.length === 0) {
    return "PAYMENT_NOT_FOUND";
  }

  if (!matchingTx) {
    return "PAYMENT_AMOUNT_MISMATCH";
  }

  return "VERIFIED";
}

function buildPaymentFields(paymentTransactions, matchingTx) {
  return {
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
  };
}

function logCalculation(logger, calculationResult) {
  logger.log(
    `- Excel total amount: ₹${calculationResult.totalAmountReceived}`
  );

  logger.log(
    `- Calculated total amount: ₹${calculationResult.calculatedTotal}`
  );

  logger.log(
    `- Calculation difference: ₹${calculationResult.difference}`
  );

  logger.log(
    `- Total amount calculation: ${
      calculationResult.isMatch ? "MATCH" : "MISMATCH"
    }`
  );
}

function logPaymentResult(
  logger,
  paymentTransactions,
  matchingTx,
  totalAmountReceived
) {
  if (matchingTx) {
    logger.log("- Payment matching Excel total: FOUND");

    logger.log(
      `- Matching Payment ID: ${matchingTx.id}`
    );

    logger.log(
      `- Matching Payment Total: ₹${
        paymentDisplayAmount(matchingTx) ?? "N/A"
      }`
    );

    return;
  }

  logger.log("- Payment matching Excel total: NOT FOUND");

  logger.log(
    `- Excel total amount: ₹${totalAmountReceived}`
  );

  if (paymentTransactions.length === 0) {
    logger.log(
      "- Other payments for this booking: NONE"
    );

    return;
  }

  logger.log("- Other payments for this booking:");

  for (const tx of paymentTransactions) {
    logger.log(
      `  - Payment ID: ${tx.id} | Payment Total: ₹${
        paymentDisplayAmount(tx) ?? "N/A"
      } | Amount: ${tx.amount ?? "N/A"} | Status: ${
        tx.status ?? "N/A"
      } | Type: ${tx.type ?? "N/A"} | Mode: ${
        tx.paymentMode ?? "N/A"
      }`
    );
  }
}

function getRowData(sheet, headers, rowNumber) {
  const row = sheet.getRow(rowNumber);

  if (!row || !row.hasValues) {
    return null;
  }

  const rowData = {};

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = headers[colNumber];

    if (header) {
      rowData[header] = extractCellValue(cell.value);
    }
  });

  return rowData;
}

function getResidentDetails(rowData) {
  const residentName = String(
    rowData["Resident Name"] || ""
  ).trim();

  const roomNumberRaw =
    rowData["Room Number"] ||
    rowData["Room Number "];

  const roomNumber =
    Number(roomNumberRaw) || roomNumberRaw;

  const email = sanitizeEmail(
    rowData["Resident Email"]
  );

  const phone = sanitizePhone(
    rowData["Resident Phone"]
  );

  return {
    residentName,
    roomNumber,
    email,
    phone,
  };
}

async function findRoom(roomNumber) {
  return Rooms.findOne({
    where: {
      roomNumber: Number(roomNumber) || 0,
      propertyId: TARGET_PROPERTY_ID,
    },
  });
}

async function findUser(email, phone) {
  const userConditions = [];

  if (email) {
    userConditions.push({ email });
  }

  if (phone) {
    userConditions.push({ phone });
  }

  if (userConditions.length === 0) {
    return null;
  }

  return User.findOne({
    where: {
      [Op.or]: userConditions,
    },
  });
}

async function findUserBookings(userId) {
  return Booking.findAll({
    where: {
      userId,
      propertyId: TARGET_PROPERTY_ID,
    },
  });
}

function findApprovedBooking(userBookings, roomId) {
  return userBookings.find(
    (booking) =>
      Number(booking.roomId) === Number(roomId) &&
      String(booking.status || "").toLowerCase() === "approved"
  );
}

function addCalculationCounters(
  rowNumber,
  calculationResult,
  calcMatchRows,
  calcMismatchRows
) {
  if (calculationResult.isMatch) {
    calcMatchRows.push(rowNumber);
  } else {
    calcMismatchRows.push(rowNumber);
  }
}

function logNameCheck(logger, residentName, dbUser) {
  const normExcelName = normalizeName(residentName);
  const normDbName = normalizeName(dbUser.fullName);

  if (normExcelName !== normDbName) {
    logger.log(
      `- Name check: MISMATCH (Excel: "${residentName}" != DB: "${dbUser.fullName}")`
    );

    return true;
  }

  logger.log("- Name check: MATCH");

  return false;
}

function logUserBookings(logger, userBookings) {
  logger.log(
    `- User bookings in DB for Property ID ${TARGET_PROPERTY_ID}: ${userBookings.length}`
  );

  for (const booking of userBookings) {
    logger.log(
      `  - Booking ID: ${booking.id}, Room ID: ${
        booking.roomId
      }, Status: ${booking.status}, Total Amount: ${
        booking.totalAmount ?? "N/A"
      }`
    );
  }
}

function logClassifiedRows(logger, finalClassificationRows) {
  logger.log("--- Classified Data ---");

  const classifications = [
    "USER_NOT_FOUND",
    "BOOKING_NOT_FOUND",
    "BOOKING_DATA_MISMATCH",
    "CALCULATION_MISMATCH",
    "PAYMENT_NOT_FOUND",
    "PAYMENT_AMOUNT_MISMATCH",
    "VERIFIED",
    "ROOM_NOT_FOUND",
  ];

  for (const classification of classifications) {
    const rows = finalClassificationRows.filter(
      (r) => r.classification === classification
    );

    logger.log(`### ${classification} (${rows.length})`);

    for (const r of rows) {
      const paymentText = r.paymentTransactions
        ? r.paymentTransactions
            .map(
              (p) =>
                `ID:${p.id},Total:${
                  p.totalAmountReceived ?? "N/A"
                },Amount:${p.amount ?? "N/A"},Status:${
                  p.status ?? "N/A"
                },Type:${p.type ?? "N/A"},Mode:${
                  p.paymentMode ?? "N/A"
                }`
            )
            .join(" || ")
        : "NOT_AVAILABLE";

      logger.log(
        `Row=${r.rowNumber} | Resident="${r.residentName}" | Room=${
          r.roomNumber
        } | UserID=${r.userId ?? "N/A"} | DBName="${
          r.dbUserName ?? "N/A"
        }" | BookingID=${r.bookingId ?? "N/A"} | Status=${
          r.bookingStatus ?? "N/A"
        } | Received=${
          r.totalAmountReceived ?? "N/A"
        } | Calculated=${
          r.calculatedAmount ?? "N/A"
        } | Difference=${r.difference ?? "N/A"} | Calculation=${
          r.calculation
        } | Payment=${r.payment} | PaymentID=${
          r.paymentId ?? "N/A"
        } | Payments=${paymentText}`
      );
    }

    logger.log("");
  }
}

function logSummary(
  logger,
  totalProcessed,
  finalClassificationRows,
  nameMismatchRows,
  deposit1Plus1Rows
) {
  logger.log("--- Summary ---");
  logger.log(`Total Rows Processed: ${totalProcessed}`);

  logger.log(
    formatSummaryLine(
      "User Not Found",
      finalClassificationRows
        .filter((r) => r.classification === "USER_NOT_FOUND")
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Booking Not Found",
      finalClassificationRows
        .filter((r) => r.classification === "BOOKING_NOT_FOUND")
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Booking Data Mismatch",
      finalClassificationRows
        .filter(
          (r) => r.classification === "BOOKING_DATA_MISMATCH"
        )
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Calculation Mismatch",
      finalClassificationRows
        .filter(
          (r) => r.classification === "CALCULATION_MISMATCH"
        )
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Payment Not Found",
      finalClassificationRows
        .filter(
          (r) => r.classification === "PAYMENT_NOT_FOUND"
        )
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Payment Amount Mismatch",
      finalClassificationRows
        .filter(
          (r) =>
            r.classification ===
            "PAYMENT_AMOUNT_MISMATCH"
        )
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Verified",
      finalClassificationRows
        .filter((r) => r.classification === "VERIFIED")
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    formatSummaryLine(
      "Room Not Found",
      finalClassificationRows
        .filter(
          (r) => r.classification === "ROOM_NOT_FOUND"
        )
        .map((r) => r.rowNumber)
    )
  );

  logger.log(
    `Name Mismatches: ${nameMismatchRows.length}`
  );

  if (deposit1Plus1Rows) {
    logger.log(
      formatSummaryLine(
        "Security Deposit 1+1 Flagged",
        deposit1Plus1Rows
      )
    );
  }

  logger.log("");

  logClassifiedRows(
    logger,
    finalClassificationRows
  );
}

async function processNonCeptSheet(
  workbook,
  logsDir
) {
  const nonCeptSheet =
    workbook.getWorksheet("Non Cept ");

  if (!nonCeptSheet) {
    return;
  }

  const logger = new SheetLogger(
    path.join(
      logsDir,
      "non_cept_verification.log"
    ),
    "Non Cept"
  );

  const headers = [];

  nonCeptSheet.getRow(1).eachCell(
    (cell, colNumber) => {
      headers[colNumber] = String(
        extractCellValue(cell.value) || ""
      ).trim();
    }
  );

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

  for (
    let rowNumber = 2;
    rowNumber <= nonCeptSheet.rowCount;
    rowNumber++
  ) {
    const rowData = getRowData(
      nonCeptSheet,
      headers,
      rowNumber
    );

    if (!rowData) {
      continue;
    }

    const {
      residentName,
      roomNumber,
      email,
      phone,
    } = getResidentDetails(rowData);

    if (
      !residentName &&
      !email &&
      !phone &&
      !roomNumber
    ) {
      continue;
    }

    totalProcessed++;

    logger.log(
      `Row ${rowNumber}: Resident: "${residentName}", Room: ${roomNumber}, Email: ${
        email || "N/A"
      }, Phone: ${phone || "N/A"}`
    );

    const dbRoom = await findRoom(roomNumber);

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
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        `- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found)`
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (No valid room/user/booking relationship)"
      );

      logger.log(
        "- Final classification: ROOM_NOT_FOUND\n"
      );

      continue;
    }

    logger.log(
      `- Room in DB (Property ID ${TARGET_PROPERTY_ID}): Yes (Room ID: ${dbRoom.id})`
    );

    const dbUser = await findUser(email, phone);

    if (!dbUser) {
      skippedUserRows.push(rowNumber);

      const calculationResult =
        calculateNonCeptAmounts(rowData);

      addCalculationCounters(
        rowNumber,
        calculationResult,
        calcMatchRows,
        calcMismatchRows
      );

      logger.log(
        `- User in DB: No (Email: ${
          email || "N/A"
        }, Phone: ${phone || "N/A"})`
      );

      logCalculation(
        logger,
        calculationResult
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (User not found; no booking/payment relationship can be safely identified)"
      );

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: null,
        dbUserName: null,
        bookingId: null,
        bookingStatus: null,
        classification: "USER_NOT_FOUND",
        calculation: calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
        totalAmountReceived:
          calculationResult.totalAmountReceived,
        calculatedAmount:
          calculationResult.calculatedTotal,
        difference: calculationResult.difference,
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        "- Final classification: USER_NOT_FOUND\n"
      );

      continue;
    }

    logger.log(
      `- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`
    );

    if (
      logNameCheck(
        logger,
        residentName,
        dbUser
      )
    ) {
      nameMismatchRows.push(rowNumber);
    }

    const userBookings =
      await findUserBookings(dbUser.id);

    const existingBooking =
      findApprovedBooking(
        userBookings,
        dbRoom.id
      );

    if (!existingBooking) {
      const classification =
        userBookings.length === 0
          ? "BOOKING_NOT_FOUND"
          : "BOOKING_DATA_MISMATCH";

      if (
        classification === "BOOKING_NOT_FOUND"
      ) {
        skippedBookingRows.push(rowNumber);
      } else {
        bookingDataMismatchRows.push(
          rowNumber
        );
      }

      const calculationResult =
        calculateNonCeptAmounts(rowData);

      addCalculationCounters(
        rowNumber,
        calculationResult,
        calcMatchRows,
        calcMismatchRows
      );

      logger.log(
        `- Real approved booking in DB for Excel Room ID ${dbRoom.id}: No`
      );

      logUserBookings(
        logger,
        userBookings
      );

      logCalculation(
        logger,
        calculationResult
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (No valid approved booking for this Excel user + room; payment lookup not performed against another booking)"
      );

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: dbUser.id,
        dbUserName: dbUser.fullName,
        bookingId: null,
        bookingStatus: null,
        classification,
        calculation: calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
        totalAmountReceived:
          calculationResult.totalAmountReceived,
        calculatedAmount:
          calculationResult.calculatedTotal,
        difference:
          calculationResult.difference,
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        `- Final classification: ${classification}\n`
      );

      continue;
    }

    approvedBookingFoundRows.push(rowNumber);

    logger.log(
      `- Real approved booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`
    );

    const secDepositType = String(
      rowData["Security Deposit Type"] || ""
    ).trim();

    if (secDepositType.includes("1+1")) {
      deposit1Plus1Rows.push(rowNumber);

      logger.log(
        "- Security deposit type: 1+1 (Expecting 1+2 for 2 advance rent, not 1+1)"
      );
    } else {
      logger.log(
        `- Security deposit type: ${
          secDepositType || "1+2"
        }`
      );
    }

    const calculationResult =
      calculateNonCeptAmounts(rowData);

    addCalculationCounters(
      rowNumber,
      calculationResult,
      calcMatchRows,
      calcMismatchRows
    );

    logCalculation(
      logger,
      calculationResult
    );

    const paymentTransactions =
      await getPaymentTransactions(
        existingBooking.id
      );

    logPaymentTransactions(
      logger,
      paymentTransactions
    );

    const matchingTx =
      findMatchingPayment(
        paymentTransactions,
        calculationResult.totalAmountReceived
      );

    if (matchingTx) {
      paymentMatchedRows.push(rowNumber);
    } else {
      paymentNotMatchedRows.push(rowNumber);
    }

    logPaymentResult(
      logger,
      paymentTransactions,
      matchingTx,
      calculationResult.totalAmountReceived
    );

    const classification =
      classifyBookingPayment({
        calculationMatches:
          calculationResult.isMatch,
        paymentTransactions,
        matchingTx,
      });

    finalClassificationRows.push({
      rowNumber,
      residentName,
      roomNumber,
      userId: dbUser.id,
      dbUserName: dbUser.fullName,
      bookingId: existingBooking.id,
      bookingStatus: existingBooking.status,
      securityDepositType: secDepositType,
      totalAmountReceived:
        calculationResult.totalAmountReceived,
      calculatedAmount:
        calculationResult.calculatedTotal,
      difference:
        calculationResult.difference,
      classification,
      calculation:
        calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
      ...buildPaymentFields(
        paymentTransactions,
        matchingTx
      ),
    });

    logger.log(
      `- Final classification: ${classification}\n`
    );
  }

  logSummary(
    logger,
    totalProcessed,
    finalClassificationRows,
    nameMismatchRows,
    deposit1Plus1Rows
  );
}

async function processCeptSheet(
  workbook,
  logsDir
) {
  const ceptSheet =
    workbook.getWorksheet("Cept ");

  if (!ceptSheet) {
    return;
  }

  const logger = new SheetLogger(
    path.join(
      logsDir,
      "cept_verification.log"
    ),
    "Cept"
  );

  const headers = [];

  ceptSheet.getRow(1).eachCell(
    (cell, colNumber) => {
      headers[colNumber] = String(
        extractCellValue(cell.value) || ""
      ).trim();
    }
  );

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

  for (
    let rowNumber = 2;
    rowNumber <= ceptSheet.rowCount;
    rowNumber++
  ) {
    const rowData = getRowData(
      ceptSheet,
      headers,
      rowNumber
    );

    if (!rowData) {
      continue;
    }

    const {
      residentName,
      roomNumber,
      email,
      phone,
    } = getResidentDetails(rowData);

    if (
      !residentName &&
      !email &&
      !phone &&
      !roomNumber
    ) {
      continue;
    }

    totalProcessed++;

    logger.log(
      `Row ${rowNumber}: Resident: "${residentName}", Room: ${roomNumber}, Email: ${
        email || "N/A"
      }, Phone: ${phone || "N/A"}`
    );

    const dbRoom = await findRoom(roomNumber);

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
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        `- Room in DB (Property ID ${TARGET_PROPERTY_ID}): No (Room ${roomNumber} not found)`
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (No valid room/user/booking relationship)"
      );

      logger.log(
        "- Final classification: ROOM_NOT_FOUND\n"
      );

      continue;
    }

    logger.log(
      `- Room in DB (Property ID ${TARGET_PROPERTY_ID}): Yes (Room ID: ${dbRoom.id})`
    );

    const dbUser = await findUser(email, phone);

    if (!dbUser) {
      skippedUserRows.push(rowNumber);

      const calculationResult =
        calculateCeptAmounts(rowData);

      addCalculationCounters(
        rowNumber,
        calculationResult,
        calcMatchRows,
        calcMismatchRows
      );

      logger.log(
        `- User in DB: No (Email: ${
          email || "N/A"
        }, Phone: ${phone || "N/A"})`
      );

      logCalculation(
        logger,
        calculationResult
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (User not found; no booking/payment relationship can be safely identified)"
      );

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: null,
        dbUserName: null,
        bookingId: null,
        bookingStatus: null,
        classification: "USER_NOT_FOUND",
        calculation: calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
        totalAmountReceived:
          calculationResult.totalAmountReceived,
        calculatedAmount:
          calculationResult.calculatedTotal,
        difference:
          calculationResult.difference,
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        "- Final classification: USER_NOT_FOUND\n"
      );

      continue;
    }

    logger.log(
      `- User in DB: Yes (User ID: ${dbUser.id}, Name: "${dbUser.fullName}")`
    );

    if (
      logNameCheck(
        logger,
        residentName,
        dbUser
      )
    ) {
      nameMismatchRows.push(rowNumber);
    }

    const userBookings =
      await findUserBookings(dbUser.id);

    const existingBooking =
      findApprovedBooking(
        userBookings,
        dbRoom.id
      );

    if (!existingBooking) {
      const classification =
        userBookings.length === 0
          ? "BOOKING_NOT_FOUND"
          : "BOOKING_DATA_MISMATCH";

      if (
        classification === "BOOKING_NOT_FOUND"
      ) {
        skippedBookingRows.push(rowNumber);
      } else {
        bookingDataMismatchRows.push(
          rowNumber
        );
      }

      const calculationResult =
        calculateCeptAmounts(rowData);

      addCalculationCounters(
        rowNumber,
        calculationResult,
        calcMatchRows,
        calcMismatchRows
      );

      logger.log(
        `- Real approved booking in DB for Excel Room ID ${dbRoom.id}: No`
      );

      logUserBookings(
        logger,
        userBookings
      );

      logCalculation(
        logger,
        calculationResult
      );

      logger.log(
        "- Payment check: NOT_AVAILABLE (No valid approved booking for this Excel user + room; payment lookup not performed against another booking)"
      );

      finalClassificationRows.push({
        rowNumber,
        residentName,
        roomNumber,
        userId: dbUser.id,
        dbUserName: dbUser.fullName,
        bookingId: null,
        bookingStatus: null,
        classification,
        calculation: calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
        totalAmountReceived:
          calculationResult.totalAmountReceived,
        calculatedAmount:
          calculationResult.calculatedTotal,
        difference:
          calculationResult.difference,
        payment: "NOT_AVAILABLE",
        paymentId: null,
        paymentTransactions: [],
      });

      logger.log(
        `- Final classification: ${classification}\n`
      );

      continue;
    }

    approvedBookingFoundRows.push(rowNumber);

    logger.log(
      `- Real approved booking in DB: Yes (Booking ID: ${existingBooking.id}, Status: ${existingBooking.status})`
    );

    const calculationResult =
      calculateCeptAmounts(rowData);

    addCalculationCounters(
      rowNumber,
      calculationResult,
      calcMatchRows,
      calcMismatchRows
    );

    logCalculation(
      logger,
      calculationResult
    );

    const paymentTransactions =
      await getPaymentTransactions(
        existingBooking.id
      );

    logPaymentTransactions(
      logger,
      paymentTransactions
    );

    const matchingTx =
      findMatchingPayment(
        paymentTransactions,
        calculationResult.totalAmountReceived
      );

    if (matchingTx) {
      paymentMatchedRows.push(rowNumber);
    } else {
      paymentNotMatchedRows.push(rowNumber);
    }

    logPaymentResult(
      logger,
      paymentTransactions,
      matchingTx,
      calculationResult.totalAmountReceived
    );

    const classification =
      classifyBookingPayment({
        calculationMatches:
          calculationResult.isMatch,
        paymentTransactions,
        matchingTx,
      });

    finalClassificationRows.push({
      rowNumber,
      residentName,
      roomNumber,
      userId: dbUser.id,
      dbUserName: dbUser.fullName,
      bookingId: existingBooking.id,
      bookingStatus: existingBooking.status,
      totalAmountReceived:
        calculationResult.totalAmountReceived,
      calculatedAmount:
        calculationResult.calculatedTotal,
      difference:
        calculationResult.difference,
      classification,
      calculation:
        calculationResult.isMatch
          ? "MATCH"
          : "MISMATCH",
      ...buildPaymentFields(
        paymentTransactions,
        matchingTx
      ),
    });

    logger.log(
      `- Final classification: ${classification}\n`
    );
  }

  logSummary(
    logger,
    totalProcessed,
    finalClassificationRows,
    nameMismatchRows
  );
}

async function verifyPastBookings() {
  const excelFilePath = path.join(
    projectRoot,
    "scripts/files/CoCo Past Bookings Aug26 v1.1.xlsx"
  );

  const logsDir = path.join(
    projectRoot,
    "scripts/logs"
  );

  if (!fs.existsSync(excelFilePath)) {
    console.error(
      `Excel file not found: ${excelFilePath}`
    );

    process.exit(1);
  }

  await sequelize.authenticate();

  try {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(
      excelFilePath
    );

    await processNonCeptSheet(
      workbook,
      logsDir
    );

    await processCeptSheet(
      workbook,
      logsDir
    );
  } finally {
    await sequelize.close();
  }
}

verifyPastBookings().catch((err) => {
  console.error(
    "Error executing verification script:",
    err
  );

  process.exit(1);
});