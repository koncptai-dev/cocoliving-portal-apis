// src/utils/sendEmail.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // false for port 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Test connection once when server starts (optional, but helpful)
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Error:', error.message);
  } else {
    console.log('✅ SMTP Server is ready to send emails');
  }
});

async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    await transporter.sendMail({
      from: `"Coco Living" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`✅ Email sent successfully to: ${to} | Subject: ${subject}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    // Do not throw — we don't want email failure to break booking approval
  }
}

module.exports = { sendEmail };