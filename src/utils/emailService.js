const nodemailer = require('nodemailer');
const CURRENT_YEAR = new Date().getFullYear();
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
    let info = await transporter.sendMail({
      from: `"COCO_LIVING" <${process.env.SMTP_USER}>`,
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
                  This message was sent via the website contact form.<br>© ${CURRENT_YEAR} COCO LIVING
                </td>
              </tr>
            </table>
            </td>
        </tr>
      </table>
    `;

    const info = await transporter.sendMail({
      from: `"CocoLiving Website" <${process.env.SMTP_USER}>`,
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
// const sendThankYouEmail = async (name, email) => {
//   try {
//     const htmlContent = `
//   <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f2ea;padding:24px 0;">
//     <tr>
//       <td align="center">
//         <table border="0" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;">
//           <tr>
//             <td align="center" style="padding:0;">
//               <img 
//                 src="https://cocoliving.in/background-img.png" 
//                 width="600" 
//                 alt="Banner"
//                 style="width:100%; max-width:600px; display:block;"
//               />
//             </td>
//               <table border="0" cellpadding="0" cellspacing="0" width="100%" height="100%" style="background-color: rgba(69, 50, 43, 0.75);">
//                 <tr>
//                   <td align="center" style="background-color:#45322b; padding:40px 20px;">
//                   <img 
//                     src="https://cocoliving.in/logo.png" 
//                     alt="COCO Living Logo" 
//                     width="120"
//                     style="display:block; margin:0 auto 16px;"
//                   />
//                     <h2 style="color:white;font-size:28px;font-weight:600;margin:0;">
//                     Hello ${name},</h2>
//                   </td>
//                 </tr>
//               </table>
//             </td>
//           </tr>

//           <tr>
//             <td style="padding:24px;text-align:center;color:#333333;">
//               <p style="font-size:18px;font-weight:600;margin-bottom:16px;">Thanks for connecting.</p>
//               <p style="margin:0 0 16px;">We’ve got your form and we’re on it. From late-night study sessions to lazy Sunday mornings</p>
//               <p style="margin:0;">We’ll help you find the space that matches your request.</p>
//             </td>
//           </tr>

//           <tr>
//             <td style="border-top:1px solid #e5e7eb;padding:16px;text-align:center;color:#6b7280;font-size:14px;">
//               📞 +91-7041454455 &nbsp; | &nbsp; 🌐 cocoliving.in &nbsp; | &nbsp; ✉️ info@cocoliving.in
//             </td>
//           </tr>
//         </table>
//         </td>
//     </tr>
//   </table>
//   `;


//     const info = await transporter.sendMail({
//       from: `Cocoliving Team <${process.env.SMTP_USER}>`,
//       to: email, // This is the recipient of the thank you email
//       subject: "Thank You For Your Inquiry!",
//       html: htmlContent,
//     });

//     console.log('Thank you email sent:', info.response);
//   } catch (error) {
//     console.error('Error sending thank you email:', error);
//   }
// };
// 2. For sending a thank you email to the sender
const sendThankYouEmail = async (name, email) => {
  try {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;background:#f3efe9;font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center">
<tr><td align="center">

<table width="600" style="max-width:600px;">

<!-- Header - now matching other templates -->
<tr>
<td align="center"
style="background-color:#4F3421;
background-image:url(cid:bg);
background-repeat:repeat;
background-size:400px 400px;
padding:28px 28px 90px;">
  <img src="cid:logo" width="140" />
</td>
</tr>

<!-- Main content -->
<tr>
<td align="center" style="background:#f3efe9;padding:0 24px 40px;">
  <div style="background:#f3efe9;border-radius:80px 80px 0 0;
  padding:40px 24px 0;max-width:520px;margin:-60px auto 0;">
    
    <h1 style="margin:0 0 16px;font-size:34px;line-height:1.25;font-weight:700;">
      Thank You, ${name}!
    </h1>

    <p style="max-width:420px;margin:0 auto 28px;font-size:15px;line-height:1.6;color:#000;">
      Thanks for reaching out to Coco Living.<br/><br/>
      We’ve received your message and we’re on it! Whether you're looking for a peaceful study space, a fun community vibe, or just the perfect place to call home — we’ll help you find it.
    </p>

    <p style="max-width:420px;margin:0 auto 32px;font-size:15px;line-height:1.6;color:#000;">
      Our team will get back to you soon.
    </p>

    <a href="https://staging.cocoliving.in/"
    style="display:inline-block;padding:14px 32px;background:#D36517;
    color:#fff;text-decoration:none;border-radius:24px;font-weight:600;">
      Explore Coco Living
    </a>
  </div>
</td>
</tr>

<!-- Footer - aligned with other templates -->
<tr>
<td align="center" style="background:#4a2f1b;color:#fff;
padding:28px 20px;font-size:12px;line-height:1.6;">
  <div>© ${CURRENT_YEAR} COCO LIVING</div>
  <div>The Spark Tower S.G. Highway, Ahmedabad</div>
  <div>
    <img src="cid:phone" width="9"/> +91-7041454455
    &nbsp;
    <img src="cid:mail" width="10"/> info@cocoliving.in
  </div>
  <div style="margin:10px 0;">
    <a href="https://cocoliving.in/privacy-policy" style="color:#fff;">Privacy Policy</a>
    &nbsp;&nbsp;
    <a href="https://cocoliving.in/terms-and-conditions" style="color:#fff;">Terms & Conditions</a>
  </div>
  <div>
    <img src="cid:instagram" width="18"/>
    <img src="cid:facebook" width="18"/>
    <img src="cid:linkedin" width="18"/>
  </div>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
    `;

    // Important: Add the same attachments as your other branded emails
    const attachments = [
      { filename: 'logo.png', path: path.join(__dirname, 'assets/logo.png'), cid: 'logo' },
      { filename: 'bg-pattern.png', path: path.join(__dirname, 'assets/bg-pattern.png'), cid: 'bg' },
      { filename: 'phone.png', path: path.join(__dirname, 'assets/phone-icon.png'), cid: 'phone' },
      { filename: 'mail.png', path: path.join(__dirname, 'assets/mail-icon.png'), cid: 'mail' },
      { filename: 'instagram.png', path: path.join(__dirname, 'assets/instagram.png'), cid: 'instagram' },
      { filename: 'facebook.png', path: path.join(__dirname, 'assets/facebook.png'), cid: 'facebook' },
      { filename: 'linkedin.png', path: path.join(__dirname, 'assets/linkedin.png'), cid: 'linkedin' },
    ];

    const info = await transporter.sendMail({
      from: `CocoLiving Team <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Thank You For Your Inquiry!",
      html: htmlContent,
      attachments: attachments,   // ← added
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