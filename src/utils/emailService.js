const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

//forgot password
exports.sendResetEmail = async (email, code) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Password Reset Code',
      text: `Your password reset code is ${code}`,
    })
    console.log('Reset email sent:', info.response);

  } catch (error) {
    console.log('Error sending reset email:', error);
    throw error;
  }
}

//mail sender
const mailsender = async (email, title, body, attachments = []) => {

  try {
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
    let info = await transporter.sendMail({
      from: 'COCO_LIVING',
      to: `${email}`,
      subject: `${title}`,
      html: `${body}`,
      attachments,
    })
    // console.log('information',info);
    return info;
  }
  catch (err) {
    console.log("Email Sendin Failed:", err.message);
    throw err;
  }
}

// 1. For contact form submissions
const sendContactEmail = async (name, email, phone, message) => {
  try {
    const htmlContent = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f5f2ea; padding: 24px 0;">
        <tr>
          <td align="center">
            <table border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <tr>
                <td style="background-color: #45322b; color: white; padding: 24px; text-align: center;">
                  <h2 style="margin: 0; font-size: 24px; font-weight: 600;">New Contact Form Submission</h2>
                </td>
              </tr>

              <tr>
                <td style="padding: 24px; color: #333333;">
                  <p style="margin: 0 0 16px;"><strong>Name:</strong> ${name}</p>
                  <p style="margin: 0 0 16px;"><strong>Email:</strong> ${email}</p>
                  <p style="margin: 0 0 16px;"><strong>Phone:</strong> ${phone}</p>
                  <p style="margin: 0 0 8px;"><strong>Message:</strong></p>
                  <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #007BFF; word-wrap: break-word;">
                    ${message.replace(/\n/g, "<br>")}
                  </div>
                </td>
              </tr>

              <tr>
                <td style="border-top: 1px solid #e5e7eb; padding: 16px; text-align: center; color: #6b7280; font-size: 14px;">
                  This message was sent via the website contact form.<br>© 2025 COCO LIVING
                </td>
              </tr>
            </table>
            </td>
        </tr>
      </table>
    `;

    const info = await transporter.sendMail({
      from: `"CocoLiving Website" <info@cocoliving.in>`,
      replyTo: `"${name}" <${email}>`,
      to: `<${process.env.SMTP_USER}>`,
      subject: "Website Contact Inquiry",
      html: htmlContent,
    });

    console.log('Contact email sent:', info.response);

    // Call the new thank you email function here
    await sendThankYouEmail(name, email);

  } catch (error) {
    console.error('Error sending contact email:', error);
    throw error;
  }
};

// 2. For sending a thank you email to the sender
const sendThankYouEmail = async (name, email) => {
  try {
    const htmlContent = `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f2ea;padding:24px 0;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:0;">
              <img 
                src="https://cocoliving.in/background-img.png" 
                width="600" 
                alt="Banner"
                style="width:100%; max-width:600px; display:block;"
              />
            </td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" height="100%" style="background-color: rgba(69, 50, 43, 0.75);">
                <tr>
                  <td align="center" style="background-color:#45322b; padding:40px 20px;">
                  <img 
                    src="https://cocoliving.in/logo.png" 
                    alt="COCO Living Logo" 
                    width="120"
                    style="display:block; margin:0 auto 16px;"
                  />
                    <h2 style="color:white;font-size:28px;font-weight:600;margin:0;">
                    Hello ${name},</h2>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px;text-align:center;color:#333333;">
              <p style="font-size:18px;font-weight:600;margin-bottom:16px;">Thanks for connecting.</p>
              <p style="margin:0 0 16px;">We’ve got your form and we’re on it. From late-night study sessions to lazy Sunday mornings</p>
              <p style="margin:0;">We’ll help you find the space that matches your request.</p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:16px;text-align:center;color:#6b7280;font-size:14px;">
              📞 +91-7041454455 &nbsp; | &nbsp; 🌐 cocoliving.in &nbsp; | &nbsp; ✉️ info@cocoliving.in
            </td>
          </tr>
        </table>
        </td>
    </tr>
  </table>
  `;


    const info = await transporter.sendMail({
      from: `Cocoliving Team <${process.env.SMTP_USER}>`,
      to: email, // This is the recipient of the thank you email
      subject: "Thank You For Your Inquiry!",
      html: htmlContent,
    });

    console.log('Thank you email sent:', info.response);
  } catch (error) {
    console.error('Error sending thank you email:', error);
  }
};

// 3. For sending a Job Application Recieved Email
const sendJobApplicationEmail = async (applicant) => {
  try {
    const { firstName, lastName, email, contact, experience, position, resumePath, resumeName } =
      applicant;

    const companyEmailRecipient = process.env.RECIPIENT_EMAIL; // Ensure this is set in your environment variables or hardcoded

    const htmlContent = `
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f2ea;padding:24px 0;font-family:Arial,sans-serif;">
  <tr>
    <td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        
        <tr>
          <td align="center" style="padding:24px; background-color:#45322b;">
            <h1 style="color:white;font-size:24px;font-weight:700;margin:0;">🚨 NEW JOB APPLICATION RECEIVED 🚨</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:24px;text-align:left;color:#333333;">
            <p style="font-size:16px;font-weight:400;margin-bottom:16px;">
              A new candidate has just submitted an application for a position at **COCO Living**.
            </p>
            <p style="font-size:16px;font-weight:400;margin:0 0 24px;">
              Please find the details of the application below for review.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px;background:#f9f9f9;color:#333333;border-top:1px solid #e5e7eb;">
            <h3 style="font-size:18px;font-weight:600;margin-bottom:16px;color:#45322b;">Applicant Information:</h3>
            <table cellpadding="8" cellspacing="0" width="100%" style="font-size:15px;">
              <tr>
                <td width="30%" style="font-weight:600; color:#555;">Position Applied For:</td>
                <td width="70%" style="font-weight:700; color:#000;">${position}</td>
              </tr>
              <tr>
                <td style="font-weight:600; color:#555;">Full Name:</td>
                <td>${firstName} ${lastName}</td>
              </tr>
              <tr>
                <td style="font-weight:600; color:#555;">Email:</td>
                <td><a href="mailto:${email}" style="color:#1a73e8;text-decoration:none;">${email}</a></td>
              </tr>
              <tr>
                <td style="font-weight:600; color:#555;">Contact Number:</td>
                <td>${contact}</td>
              </tr>
              <tr>
                <td style="font-weight:600; color:#555;">Years of Experience:</td>
                <td>${experience}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e5e7eb;padding:16px;text-align:center;color:#6b7280;font-size:14px;">
            This is an automated notification from the COCO Living Career Form.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

    const info = await transporter.sendMail({
      from: `COCO Living Careers <${process.env.SMTP_USER}>`,
      to: companyEmailRecipient,
      subject: `New Applicant: ${firstName} ${lastName} for ${position}`,
      html: htmlContent,
      attachments: [
        {
          filename: resumeName,
          path: resumePath,
        },
      ],
    });

    console.log("Job application notification email sent to HR:", info.response);
  } catch (error) {
    console.error("Error sending job application notification email:", error);
  }
};


module.exports = {      
  mailsender,
  sendContactEmail,
  sendJobApplicationEmail
};