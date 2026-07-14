const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const Booking = require('../models/bookRoom');
const User = require('../models/user');
const { sendEmail } = require('./sendEmail');
const {
  acknowledgementReceiptEmail,
} = require('./emailTemplates/emailTemplates');

const ACKNOWLEDGEMENT_DIR = path.join(
  __dirname,
  '../uploads/acknowledgements'
);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateReceived(transaction) {
  if (
    transaction.paymentDate &&
    /^\d{2}\/\d{2}\/\d{4}$/.test(transaction.paymentDate)
  ) {
    return transaction.paymentDate;
  }

  return new Date(
    transaction.createdAt || Date.now()
  ).toLocaleDateString('en-IN');
}

async function generateAndSendAcknowledgementReceipt(transaction) {
  let browser;

  try {
    if (!transaction?.bookingId) {
      console.error(
        '[ACKNOWLEDGEMENT RECEIPT] Missing bookingId for transaction:',
        transaction?.id
      );

      return false;
    }

    const booking = await Booking.findByPk(transaction.bookingId);

    if (!booking) {
      console.error(
        '[ACKNOWLEDGEMENT RECEIPT] Booking not found:',
        transaction.bookingId
      );

      return false;
    }

    const user = await User.findByPk(booking.userId);

    if (!user?.email) {
      console.error(
        '[ACKNOWLEDGEMENT RECEIPT] User or email not found for booking:',
        booking.id
      );

      return false;
    }

    await fs.promises.mkdir(ACKNOWLEDGEMENT_DIR, {
      recursive: true,
    });

    const filename =
      `Acknowledgement-Receipt-${transaction.id}.pdf`;

    const pdfPath = path.join(
      ACKNOWLEDGEMENT_DIR,
      filename
    );
    
    const acknowledgementPdfPath = `/uploads/acknowledgements/${filename}`;

    const amountReceived = (
      Number(transaction.amount || 0) / 100
    ).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const dateReceived = formatDateReceived(transaction);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />

  <style>
    @page {
      size: A4;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #222;
      font-family: Arial, sans-serif;
      background: #fff;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 28mm 24mm;
    }

    h1 {
      margin: 0 0 28px;
      text-align: center;
      font-size: 24px;
      letter-spacing: 1px;
    }

    .details {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .details td {
      padding: 12px 10px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
      vertical-align: top;
    }

    .label {
      width: 38%;
      font-weight: 700;
    }

    p {
      font-size: 14px;
      line-height: 1.7;
      margin: 20px 0;
    }

    .disclaimer {
      margin-top: 48px;
      padding-top: 18px;
      border-top: 1px solid #bbb;
      font-size: 12px;
    }
  </style>
</head>

<body>
  <main class="page">
    <h1>ACKNOWLEDGEMENT RECEIPT</h1>

    <table class="details">
      <tr>
        <td class="label">Transaction ID</td>
        <td>${escapeHtml(transaction.merchantOrderId)}</td>
      </tr>

      <tr>
        <td class="label">Date received</td>
        <td>${escapeHtml(dateReceived)}</td>
      </tr>

      <tr>
        <td class="label">Received from</td>
        <td>${escapeHtml(user.fullName)}</td>
      </tr>

      <tr>
        <td class="label">Amount received</td>
        <td>₹${escapeHtml(amountReceived)}</td>
      </tr>

      <tr>
        <td class="label">Received by</td>
        <td>Collab Colony Pvt. Ltd.</td>
      </tr>
    </table>

    <p>
      Collab Colony Pvt. Ltd. hereby acknowledges receipt of the amount stated above from the named payer.
    </p>

    <p class="disclaimer">
      This acknowledgement is issued solely as confirmation of payment received. It does not constitute a bill, an invoice, or a tax invoice.
    </p>
  </main>
</body>
</html>
`;

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
    });

    transaction.invoicePdfPath = acknowledgementPdfPath;
    await transaction.save();

    console.log(
      `[ACKNOWLEDGEMENT RECEIPT] Path saved for transaction ${transaction.id}: ${acknowledgementPdfPath}`
    );

    const email = acknowledgementReceiptEmail({
      userName: user.fullName || 'Guest',
    });

    await sendEmail({
      to: user.email,
      subject:
        'Payment Acknowledgement Receipt - Collab Colony',
      html: email.html,
      attachments: [
        ...(email.attachments || []),
        {
          filename,
          path: pdfPath,
        },
      ],
    });

    console.log(
      `[ACKNOWLEDGEMENT RECEIPT] Generated and emailed for transaction ${transaction.id}`
    );

    return true;
  } catch (error) {
    console.error(
      '[ACKNOWLEDGEMENT RECEIPT] Failed:',
      error
    );

    return false;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(
          '[ACKNOWLEDGEMENT RECEIPT] Browser close failed:',
          closeError
        );
      }
    }
  }
}

module.exports = {
  generateAndSendAcknowledgementReceipt,
};