const fs = require("fs");
const path = require("path");

const Booking = require("../models/booking");
const User = require("../models/user");
const { invoiceEmail } = require("./emailTemplates/emailTemplates");

const { sendEmail } = require("../utils/sendEmail");

function numberToWordsINR(value) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const toWordsUnder1000 = (num) => {
    let words = "";
    if (num >= 100) {
      words += `${ones[Math.floor(num / 100)]} Hundred `;
      num %= 100;
    }
    if (num >= 20) {
      words += `${tens[Math.floor(num / 10)]} `;
      num %= 10;
    }
    if (num > 0) {
      words += `${ones[num]} `;
    }
    return words.trim();
  };

  const toWordsIndian = (num) => {
    if (num === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const hundred = num % 1000;

    if (crore) parts.push(`${toWordsUnder1000(crore)} Crore`);
    if (lakh) parts.push(`${toWordsUnder1000(lakh)} Lakh`);
    if (thousand) parts.push(`${toWordsUnder1000(thousand)} Thousand`);
    if (hundred) parts.push(toWordsUnder1000(hundred));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let result = `INR ${toWordsIndian(rupees)} Only`;
  if (paise > 0) {
    result = `INR ${toWordsIndian(rupees)} and ${toWordsIndian(paise)} Paise Only`;
  }
  return result;
}

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
    const invoiceDateObj = new Date();
    const invoiceDate = `${invoiceDateObj.getDate()}-${invoiceDateObj.toLocaleString("en-GB", {
      month: "short",
    })}-${invoiceDateObj.getFullYear().toString().slice(-2)}`;

    const invoiceDir = path.join(__dirname, "../uploads/invoices");

    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const filePath = path.join(invoiceDir, `${invoiceNo}.html`);

    const amountInWords = numberToWordsINR(total);
    const partyAddress = (user.address || "Ahmedabad").replace(/\n/g, "<br />");

    const invoiceHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${invoiceNo}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
      .page { max-width: 720px; margin: 0 auto; border: 1px solid #333; padding: 24px; }
      .center { text-align: center; }
      .right { text-align: right; }
      .small { font-size: 12px; }
      .underline { text-decoration: underline; }
      .title { font-size: 16px; font-weight: 700; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; gap: 12px; }
      .mt-8 { margin-top: 8px; }
      .mt-12 { margin-top: 12px; }
      .mt-16 { margin-top: 16px; }
      .mt-20 { margin-top: 20px; }
      .block { display: block; }
      .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
      .table th, .table td { border: 1px solid #333; padding: 6px 6px; vertical-align: top; }
      .table th { font-weight: 700; text-align: center; }
      .nowrap { white-space: nowrap; }
      .particulars { min-height: 140px; }
      .amount-cell { text-align: right; }
      .footer-grid { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="center small underline">SUBJECT TO AHMEDABAD JURISDICTION</div>

      <div class="row mt-12 small">
        <div><strong>Invoice No.</strong> ${invoiceNo}</div>
        <div><strong>Dated</strong> ${invoiceDate}</div>
      </div>

      <div class="center mt-12">
        <div class="small"><strong>COLLAB COLONY PRIVATE LIMITED</strong></div>
        <div class="small">9th Floor, 904 & 905, Palak Prime, Iskon Ambli</div>
        <div class="small">Road, Double Tree By Hilton Ahmedabad,</div>
        <div class="small">AMBALI, Ahmedabad, Ahmedabad, Gujarat,</div>
        <div class="small">380058</div>
      </div>

      <div class="center mt-8 small">
        <div><strong>GSTIN/UIN:</strong> 24AAMCC5937H1ZG</div>
        <div><strong>State Name:</strong> Gujarat, Code : 24</div>
        <div><strong>CIN:</strong> U68100GJ2025PTC161058</div>
      </div>

      <div class="center title">Tax Invoice</div>

      <div class="mt-12 small">
        <div><strong>Party :</strong> ${user.fullName}</div>
        <div class="block">${partyAddress}</div>
        <div class="mt-8"><strong>PAN/IT No</strong> : ${user.panNumber || user.panNo || "-"}</div>
        <div><strong>State Name</strong> : Gujarat, Code : 24</div>
      </div>

      <table class="table mt-12">
        <thead>
          <tr>
            <th class="nowrap">Sl No.</th>
            <th>Particulars</th>
            <th class="nowrap">HSN/SAC</th>
            <th class="nowrap">GST<br />Rate</th>
            <th class="nowrap">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="nowrap">1</td>
            <td class="particulars">
              <div><strong>Accommodation, Food and Beverage Services</strong></div>
              <div class="mt-8">CGST Output 2.5%</div>
              <div>SGST Output 2.5%</div>
            </td>
            <td class="center">9963</td>
            <td class="center">5%</td>
            <td class="amount-cell">
              ${amount.toFixed(2)}<br />
              ${cgst.toFixed(2)}<br />
              ${sgst.toFixed(2)}
            </td>
          </tr>
          <tr>
            <td colspan="4" class="right"><strong>Total</strong></td>
            <td class="amount-cell"><strong>₹ ${total.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="row mt-8 small">
        <div>
          <div>Amount Chargeable (in words)</div>
          <div><strong>${amountInWords}</strong></div>
        </div>
        <div class="right">E. & O. E</div>
      </div>

      <div class="footer-grid mt-12">
        <div>
          <div><strong>Company's PAN</strong> : AAMCC5937H</div>
        </div>
        <div>
          <div><strong>Company's Bank Details</strong></div>
          <div>Bank Name : HDFC Bank A/c No-50200115794192</div>
          <div>A/c No. : 50200115794192</div>
          <div>Branch & IFS Code : SHAHIBAUG & HDFC0000461</div>
        </div>
      </div>

      <div class="row mt-12 small">
        <div></div>
        <div class="right">
          <div>for <strong>COLLAB COLONY PRIVATE LIMITED</strong></div>
          <div class="mt-20">Authorised Signatory</div>
        </div>
      </div>

      <div class="center small underline mt-12">This is a Computer Generated Invoice</div>
    </div>
  </body>
</html>`;

    fs.writeFileSync(filePath, invoiceHtml, "utf8");

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
            filename: `${invoiceNo}.html`,
            path: filePath
          }
        ]
      });

    console.log("Invoice generated and email sent");

    return true;
  } catch (error) {
    console.error("Invoice generation failed:", error);
  }
}

module.exports = { generateAndSendInvoice };
