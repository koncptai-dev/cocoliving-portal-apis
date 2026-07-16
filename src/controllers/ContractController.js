const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const { Booking, User, Rooms, Property, Contract, Inventory } = require("../models");
const { mailsender } = require("../utils/emailService");
const { contractSignedEmail, securityDepositPaymentEmail } = require("../utils/emailTemplates/emailTemplates");
const { notifySecurityDeposit } = require('../utils/notificationService');
const { initiateEsign } = require("../utils/idtoEsignService");
const { getSignatureBox } = require("../utils/esignSignatureCoordinates");
const { numberToRupeesWords } = require("../utils/numberToWords");

const normalize = str =>
  str
    ?.toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const ESIGN_CALLBACK_TOKEN_MIN_LENGTH = 64;

function getEsignCallbackUrl() {
  const token = process.env.ESIGN_CALLBACK_TOKEN;
  if (!token || token.length < ESIGN_CALLBACK_TOKEN_MIN_LENGTH) {
    throw new Error(
      "ESIGN_CALLBACK_TOKEN must be set to an unguessable value of at least 64 characters"
    );
  }

  if (!process.env.APP_BASE_URL) {
    throw new Error("APP_BASE_URL must be set to build the eSign callback URL");
  }

  const callbackUrl = new URL(
    "/api/contracts/esign/callback",
    process.env.APP_BASE_URL
  );
  if (callbackUrl.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS for the eSign callback URL");
  }

  callbackUrl.searchParams.set("token", token);
  return callbackUrl.toString();
}

function hasValidEsignCallbackToken(receivedToken) {
  const expectedToken = process.env.ESIGN_CALLBACK_TOKEN;
  if (!expectedToken || expectedToken.length < ESIGN_CALLBACK_TOKEN_MIN_LENGTH) {
    return false;
  }
  if (typeof receivedToken !== "string") return false;

  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}


/**
 * Renders the HTML template into a PDF buffer using Puppeteer
 */
const renderContractPdf = async (booking,contract = null) => {
  const templateFile =
    booking.user.userType === "student"
      ? "contract-student.html"
      : "contract-professional.html";

  const templatePath = path.join(
    __dirname,
    "../utils/emailTemplates",
    templateFile
  );
  let html = fs.readFileSync(templatePath, "utf8");

  const { user, room } = booking;
  const date = new Date().toLocaleDateString("en-IN");


  // Signatures as Base64
  let inventoryTable = "";

  const assignedItemIds = booking.assignedItems || [];

  const assignedItems = assignedItemIds.length
    ? await Inventory.findAll({
        where: {
          id: assignedItemIds
        },
        attributes: ["itemName", "condition"]
      })
    : [];
  const findInventory = keyword =>
    assignedItems.find(item =>
      normalize(item.itemName).includes(normalize(keyword))
    );
  const dynamicItems = [
    { keyword: "bed", label: "Bed" },
    { keyword: "wardrobe", label: "Wardrobe" },
    { keyword: "study table", label: "Study Table" },
    { keyword: "chair", label: "Chair" }
  ];

  dynamicItems.forEach(({ keyword, label }) => {
    const item = findInventory(keyword);

    if (!item) return;

    inventoryTable += `
      <tr>
        <td>${label}</td>
        <td>1</td>
        <td>${item.condition || ""}</td>
        <td></td>
      </tr>
    `;
  });
  inventoryTable += `
  <tr>
    <td>Access Card / Key</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>Linen</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>AC Remote</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>

  <tr>
    <td>Other Items</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  `;
  const residentAge =
    user.dateOfBirth
      ? Math.floor(
          (new Date() - new Date(user.dateOfBirth)) /
          (365.25 * 24 * 60 * 60 * 1000)
        )
      : "";
  // Replace placeholders
  const replacements = {
    agreement_date: date,

    resident_name: user.fullName || "",
    resident_email: user.email || "",
    resident_phone: user.phone || "",

    resident_age: residentAge,
    resident_dob: user.dateOfBirth || "",
    resident_address: user.address || "",

    educational_details: 
      user.collegeName && user.course
        ? `${user.collegeName} / ${user.course}`
        : !!user.collegeName
          ? user.collegeName
          : !!user.course
            ? user.course
            : "",

    student_year: user.studyingYear || "",
    guardian_name: user.parentName || "",
    guardian_relation: "Parent",
    guardian_address: user.address || "",
    guardian_phone: user.parentMobile || "",
    guardian_email: user.parentEmail || "",

    emergency_contact: "",

    property_name: room?.property?.name || "",
    property_address: room?.property?.address || "",

    room_type: room?.roomType || "",
    room_number: room?.roomNumber || "",
    bed_number: findInventory("bed")?.itemName || "N/A",

    commencement_date: booking.checkInDate || "",
    end_date: booking.checkOutDate || "",

    lockin_period: "3 Months",

    monthly_rent: booking.monthlyRent || "",
    security_deposit: booking.monthlyRent * 2 || "",
    advance_rent: "",

    electricity_rate: 12,

    notice_period: "30 Days",

    meal_preference: user.foodPreference || "",

    special_terms: "",

    late_payment_charges:
      room?.property?.lateFeePerDay
        ? `Rs. ${room.property.lateFeePerDay} per day`
        : "",

    unauthorized_occupancy_charges: "",

    replacement_charges: "As per actuals",

    resident_signature:"",
    operator_signature:"",
    guardian_signature: "",

    employer_name: user.companyName || "",
    resident_signed_date:"",

    operator_signed_date:"",
    designation: user.position || "",
    student_id_details: "",
    guardian_id_details: "",
    government_id_details: "",
    medical_conditions: "",
    official_email: "",
    employee_id: "",
    office_address: "",
    inventory_table: inventoryTable,
  };

  Object.entries(replacements).forEach(([key, value]) => {
    html = html.replace(
      new RegExp(`{{${key}}}`, "g"),
      value ?? ""
    );
  });
  const cssPath = path.join(
    __dirname,
    "../utils/emailTemplates/contractBase.css"
  );
  const css = fs.readFileSync(cssPath, "utf8");
  html = html.replace(
    "</head>",
    `<style>${css}</style></head>`
  );
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    printBackground: true
  });
  await browser.close();

  return pdfBuffer;
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
    const contract = await Contract.findOne({ where: { bookingId } });
    if (contract?.esignStatus === "COMPLETED" && contract.signedPdfPath) {
      return res.json({
        signed: true,
        esignStatus: contract.esignStatus,
        fileUrl: `/uploads/contracts/${path.basename(contract.signedPdfPath)}`
      });
    }

    if (contract?.esignStatus === "IN_PROGRESS") {
      return res.json({
        signed: false,
        esignStatus: "IN_PROGRESS",
        message: "Contract has been sent for eSignature. Waiting on signer(s) to complete signing."
      });
    }
    const pdfBuffer = await renderContractPdf(booking);
    const tempPath = path.join(__dirname, `../uploads/contracts/temp-${bookingId}.pdf`);

    const dir = path.dirname(tempPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(tempPath, pdfBuffer);

    return res.json({
      signed: false,
      esignStatus: contract?.esignStatus || "NOT_INITIATED",
      fileUrl: `/uploads/contracts/temp-${bookingId}.pdf`
    });

  } catch (err) {
    console.error("Error in getContract:", err);
    return res.status(500).json({ message: err.message });
  }
};

exports.initiateEsign = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await loadBookingForContract(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "approved")
      return res.status(400).json({ message: "Booking not approved" });
    const isOwner = booking.userId === req.user.id;
    const isAdmin = req.user.role === 1;
    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: "Unauthorized" });
    let contract = await Contract.findOne({ where: { bookingId } });
    if (
      contract &&
      ["IN_PROGRESS", "COMPLETED"].includes(contract.esignStatus)
    ) {
      return res.status(400).json({
        message: `eSign already ${contract.esignStatus.toLowerCase()} for this booking`
      });
    }

    const isStudent = booking.user.userType === "student";
    if (isStudent && (!booking.user.parentEmail || !booking.user.parentMobile)) {
      return res.status(400).json({
        message: "Guardian email and mobile number are required before initiating eSign for a student booking"
      });
    }
    const callbackUrl = getEsignCallbackUrl();
    const pdfBuffer = await renderContractPdf(booking);
    if (pdfBuffer.length > MAX_ESIGN_PDF_BYTES) {
      return res.status(400).json({ message: "Generated contract PDF exceeds IDto's 10MB limit" });
    }
    const pdfBase64 = pdfBuffer.toString("base64");
    const referenceDocId = `booking-${bookingId}-${Date.now()}`;
    const signatureType = process.env.ESIGN_SIGNATURE_TYPE || "Electronic";
    const layout = isStudent ? "student" : "professional";

    const signers = [];
    let sequence = 1;

    const residentBox = getSignatureBox(layout, "resident");
    signers.push({
      signer_ref_id: `resident-${booking.user.id}`,
      signer_name: booking.user.fullName,
      signer_email: booking.user.email,
      signer_mobile: booking.user.phone,
      signature_type: signatureType,
      trigger_esign_request: true,
      authentication_mode: "email",
      document_to_be_signed: referenceDocId,
      signer_position: { appearance: [residentBox.box] },
      page_number: residentBox.page_number,
      sequence: sequence++
    });

    if (isStudent) {
      const guardianBox = getSignatureBox(layout, "guardian");
      signers.push({
        signer_ref_id: `guardian-${booking.user.id}`,
        signer_name: booking.user.parentName || "Guardian",
        signer_email: booking.user.parentEmail,
        signer_mobile: booking.user.parentMobile,
        signature_type: signatureType,
        trigger_esign_request: true,
        authentication_mode: "email",
        document_to_be_signed: referenceDocId,
        signer_position: { appearance: [guardianBox.box] },
        page_number: guardianBox.page_number,
        sequence: sequence++
      });
    }

    const operatorBox = getSignatureBox(layout, "operator");
    signers.push({
      signer_ref_id: `operator-${booking.room.property.id}`,
      signer_name: process.env.ESIGN_OPERATOR_NAME || "CoCo Living",
      signer_email: process.env.ESIGN_OPERATOR_EMAIL,
      signer_mobile: process.env.ESIGN_OPERATOR_MOBILE,
      signature_type: signatureType,
      trigger_esign_request: true,
      authentication_mode: "email",
      document_to_be_signed: referenceDocId,
      signer_position: { appearance: [operatorBox.box] },
      page_number: operatorBox.page_number,
      sequence: sequence++
    });
    const payload = {
      agreement_type: "rental_agreement",
      docket_title: `Rental Agreement - Booking #${bookingId}`,
      docket_description: `CoCo Living rental agreement for ${booking.user.fullName}`,
      final_copy_recipients: [booking.user.email, process.env.ESIGN_OPERATOR_EMAIL]
        .filter(Boolean)
        .join(","),
      callback_file_content: true,
      documents: [
        {
          reference_doc_id: referenceDocId,
          content_type: "pdf",
          content: pdfBase64,
          signature_sequence: "sequential",
          return_url: callbackUrl
        }
      ],
      signers_info: signers,
      user_id: String(booking.user.id)
    };
    const idtoResponse = await initiateEsign(payload);
    if (!contract) {
      contract = await Contract.create({ bookingId, signedPdfPath: "" });
    }
    contract.esignReferenceDocId = referenceDocId;
    contract.esignDocketId = idtoResponse?.document_id || idtoResponse?.docket_id || null;
    contract.esignStatus = "IN_PROGRESS";
    contract.esignRawResponse = idtoResponse;
    await contract.save();
 
    booking.contractStatus = "NOT_SIGNED";
    booking.adminContractStatus = "NOT_SIGNED";
    await booking.save();
 
    return res.json({
      message: "eSign workflow initiated. Signers will receive invitations via email/SMS.",
      referenceDocId,
      idtoResponse
    });
 
  } catch (err) {
    console.error("Error in initiateEsign:", err);
    return res.status(err.status || 500).json({ message: err.message });
  }
};

exports.esignCallback = async (req, res) => {
  try {
    if (!hasValidEsignCallbackToken(req.query.token)) {
      console.warn("esignCallback: rejected callback with an invalid token");
      return res.status(401).json({ message: "Unauthorized callback" });
    }

    const { status, document_id, file_content } = req.body;
    if (!document_id || typeof document_id !== "string") {
      return res.status(400).json({ message: "document_id is required" });
    }
    const contract =
      (await Contract.findOne({ where: { esignReferenceDocId: document_id } })) ||
      (await Contract.findOne({ where: { esignDocketId: document_id } }));
 
    if (!contract) {
      console.warn("esignCallback: no matching contract for document_id", document_id);
      return res.status(404).json({ message: "Unknown document_id" });
    }

    if (contract.esignStatus !== "IN_PROGRESS") {
      console.warn("esignCallback: ignored callback for contract not in progress", contract.id);
      return res.json({ received: true, ignored: true });
    }
 
    contract.esignRawResponse = { ...(contract.esignRawResponse || {}), lastCallback: req.body };
 
    if (status === "success") {
      contract.esignStatus = "COMPLETED";
      contract.signedAt = new Date();
 
      if (file_content) {
        const finalPath = path.join(
          __dirname,
          `../uploads/contracts/contract-${contract.bookingId}.pdf`
        );
        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(finalPath, Buffer.from(file_content, "base64"));
        contract.signedPdfPath = finalPath;
      }
 
      await contract.save();
 
      const booking = await loadBookingForContract(contract.bookingId);
      booking.contractStatus = "SIGNED";
      booking.adminContractStatus = "SIGNED";
      await booking.save();
 
      const contractEmail = contractSignedEmail({
        userName: booking.user.fullName,
        bookingId: booking.id
      });
 
      await mailsender(
        booking.user.email,
        "Your Fully Signed Rental Agreement - CoCo Living",
        contractEmail.html,
        contract.signedPdfPath
          ? [...contractEmail.attachments, { filename: `contract-${booking.id}.pdf`, path: contract.signedPdfPath }]
          : contractEmail.attachments
      );
 
      if (!booking.securityDepositPaid) {
        await notifySecurityDeposit(booking);
 
        const email = securityDepositPaymentEmail({
          userName: booking.user.fullName,
          propertyName: booking.room.property.name,
          bookingId: booking.id
        });
 
        await mailsender(
          booking.user.email,
          "Security Deposit Payment Required - CoCo Living",
          email.html,
          email.attachments
        );
      }
    } else {
      contract.esignStatus = "FAILED";
      await contract.save();
    }
 
    return res.json({ received: true });
 
  } catch (err) {
    console.error("Error in esignCallback:", err);
    return res.status(500).json({ message: err.message });
  }
};