// utils/emailTemplates.js
const path = require('path');

// ---------- COMMON ATTACHMENTS ----------
const baseAttachments = [
  { filename: 'logo.png', path: path.join(__dirname, 'assets/logo.png'), cid: 'logo' },
  { filename: 'bg-pattern.png', path: path.join(__dirname, 'assets/bg-pattern.png'), cid: 'bg' },
  { filename: 'quality.png', path: path.join(__dirname, 'assets/quality-spaces.png'), cid: 'quality' },
  { filename: 'tech.png', path: path.join(__dirname, 'assets/smart-tech.png'), cid: 'tech' },
  { filename: 'community.png', path: path.join(__dirname, 'assets/handshaking.png'), cid: 'community' },
  { filename: 'phone.png', path: path.join(__dirname, 'assets/phone-icon.png'), cid: 'phone' },
  { filename: 'mail.png', path: path.join(__dirname, 'assets/mail-icon.png'), cid: 'mail' },
  { filename: 'instagram.png', path: path.join(__dirname, 'assets/instagram.png'), cid: 'instagram' },
  { filename: 'facebook.png', path: path.join(__dirname, 'assets/facebook.png'), cid: 'facebook' },
  { filename: 'linkedin.png', path: path.join(__dirname, 'assets/linkedin.png'), cid: 'linkedin' },
];

// ---------- WELCOME EMAIL ----------
function welcomeEmail() {
  return {
    attachments: baseAttachments,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>

<body style="margin:0;background:#f3efe9;
font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center">
<tr><td align="center">

<table width="600" style="max-width:600px;">

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

<tr>
<td align="center" style="background:#f3efe9;padding:0 24px 40px;">
  <div style="background:#f3efe9;border-radius:80px 80px 0 0;
  padding:40px 24px 0;max-width:520px;margin:-60px auto 0;">
    <h1 style="margin:0 0 16px;font-size:34px;line-height:1.25;font-weight:700;">
      Welcome to Coco Living!<br/>Home Awaits!
    </h1>

    <p style="max-width:420px;margin:0 auto 28px;font-size:14px;line-height:1.6;color:#000;">
      We’re thrilled to have you join our community.
      Discover premium, blissful spaces where comfort,
      smart living, and community come together.
    </p>

    <a href="https://staging.cocoliving.in/"
    style="display:inline-block;padding:14px 32px;background:#D36517;
    color:#fff;text-decoration:none;border-radius:24px;font-weight:600;">
      Explore Your New Home
    </a>
  </div>
</td>
</tr>

<tr>
<td align="center" style="background:#f3efe9;padding:16px;">
  <div style="background:#4F3421;color:#fff;width:90%;
  padding:16px 8px;font-size:14px;border-radius:12px;
  font-weight:600;letter-spacing:5px;">
    Find · Book · Move-in
  </div>
</td>
</tr>

<tr>
<td align="center" style="background:#f3efe9;padding:24px;">
<table width="100%"><tr>
<td align="center" width="33%" style="padding:14px;border:1px solid #D36517;
border-radius:10px;height:140px;font-weight:500;">
<img src="cid:quality" width="40"/><br/>Quality Spaces
</td>
<td align="center" width="33%" style="padding:14px;border:1px solid #D36517;
border-radius:10px;height:140px;font-weight:500;">
<img src="cid:tech" width="40"/><br/>Smart Tech
</td>
<td align="center" width="33%" style="padding:14px;border:1px solid #D36517;
border-radius:10px;height:140px;font-weight:500;">
<img src="cid:community" width="40"/><br/>Vibrant Community
</td>
</tr></table>
</td>
</tr>

<tr>
<td align="center" style="background:#4a2f1b;color:#fff;
padding:28px 20px;font-size:12px;line-height:1.6;">
  <div>© 2025 COCO LIVING</div>
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
`,
  };
}

// ---------- OTP EMAIL (REDESIGNED) ----------
function otpEmail({ otp }) {
  return {
    attachments: [
      { filename: 'logo.png', path: path.join(__dirname, 'assets/logo.png'), cid: 'logo' },
      { filename: 'bg-pattern.png', path: path.join(__dirname, 'assets/bg-pattern.png'), cid: 'bg' }]
    ,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>

<body style="margin:0;background:#f3efe9;
font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center">
<tr><td align="center">

<table width="420" style="max-width:420px;">

<tr>
<td align="center"
style="background-color:#4F3421;
background-image:url(cid:bg);
background-repeat:repeat;
background-size:400px 400px;
padding:28px;">
  <img src="cid:logo" width="120" />
</td>
</tr>

<tr>
<td align="center" style="background:#f3efe9;padding:32px 24px;">
  <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;">
    Verify your email
  </h2>

  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
    Use the OTP below to continue signing in to Coco Living.
  </p>

  <div style="
    font-size:28px;
    font-weight:700;
    letter-spacing:6px;
    background:#ffffff;
    padding:16px 0;
    border-radius:12px;
    width:100%;
  ">
    ${otp}
  </div>

  <p style="margin-top:18px;font-size:12px;color:#555;">
    This OTP is valid for 5 minutes only. Please do not share it.
  </p>
</td>
</tr>

<tr>
<td align="center" style="background:#4a2f1b;color:#fff;
padding:16px;font-size:11px;">
  © 2025 COCO LIVING
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
`,
  };
}

function refundInitiatedEmail({ userName, bookingId, propertyName, refundAmount, reason }) {
  return {
    attachments: baseAttachments,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;background:#f3efe9;font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center"><tr><td align="center">
<table width="600" style="max-width:600px;">
 
<tr>
<td align="center" style="background-color:#4F3421;background-image:url(cid:bg);background-repeat:repeat;background-size:400px 400px;padding:28px 28px 90px;">
<img src="cid:logo" width="140" />
</td>
</tr>
 
<tr>
<td align="center" style="background:#f3efe9;padding:0 24px 40px;">
<div style="background:#f3efe9;border-radius:80px 80px 0 0;padding:40px 24px 0;max-width:520px;margin:-60px auto 0;">
<h1 style="margin:0 0 16px;font-size:34px;font-weight:700;color:#28a745;">
      Refund Initiated 💸
</h1>
<p style="max-width:420px;margin:0 auto 28px;font-size:15px;line-height:1.6;">
      Hi ${userName},<br/><br/>
      Your refund has been initiated for the cancelled booking.
      The amount will be credited back to your original payment method soon.
</p>
 
    <div style="background:#ffffff;padding:24px;border-radius:12px;margin:24px 0;text-align:left;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<strong>Booking ID:</strong> #${bookingId}<br/>
<strong>Property:</strong> ${propertyName}<br/>
<strong>Refund Amount:</strong> ₹${refundAmount.toLocaleString('en-IN')}<br/>
      ${reason ? `<strong>Reason:</strong> ${reason}<br/>` : ''}
<br/>
<em>The amount will be credited within 5-7 business days depending on your bank/payment method.</em>
</div>
 
    <p style="font-size:15px;margin:20px 0;">
      Thank you for choosing Coco Living. We hope to welcome you soon!
</p>
 
    <a href="https://staging.cocoliving.in/" style="display:inline-block;padding:14px 32px;background:#D36517;color:#fff;text-decoration:none;border-radius:24px;font-weight:600;">
      Explore Rooms Again
</a>
</div>
</td>
</tr>
 
<!-- Footer -->
<tr>
<td align="center" style="background:#4a2f1b;color:#fff;padding:28px 20px;font-size:12px;line-height:1.6;">
<div>© 2025 COCO LIVING</div>
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
</td></tr></table>
</body>
</html>
    `,
  };
}

function refundCompletedEmail({ userName, bookingId, propertyName, refundAmount }) {
  return {
    attachments: baseAttachments,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;background:#f3efe9;font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center"><tr><td align="center">
<table width="600" style="max-width:600px;">
 
<tr>
<td align="center" style="background-color:#4F3421;background-image:url(cid:bg);padding:28px 28px 90px;">
<img src="cid:logo" width="140" />
</td>
</tr>
 
<tr>
<td align="center" style="background:#f3efe9;padding:0 24px 40px;">
<div style="background:#f3efe9;border-radius:80px 80px 0 0;padding:40px 24px 0;max-width:520px;margin:-60px auto 0;">
<h1 style="margin:0 0 16px;font-size:34px;font-weight:700;color:#28a745;">
      Refund Completed ✅
</h1>
<p style="max-width:420px;margin:0 auto 28px;font-size:15px;line-height:1.6;">
      Hi ${userName},<br/><br/>
      Great news! Your refund has been successfully processed and credited to your account.
</p>
 
    <div style="background:#ffffff;padding:24px;border-radius:12px;margin:24px 0;text-align:left;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<strong>Booking ID:</strong> #${bookingId}<br/>
<strong>Property:</strong> ${propertyName}<br/>
<strong>Refunded Amount:</strong> ₹${refundAmount.toLocaleString('en-IN')}<br/><br/>
      The amount should now reflect in your bank account or original payment method.
</div>
 
    <p style="font-size:15px;margin:20px 0;">
      We hope to see you again soon at Coco Living!
</p>
 
    <a href="https://staging.cocoliving.in/" style="display:inline-block;padding:14px 32px;background:#D36517;color:#fff;text-decoration:none;border-radius:24px;font-weight:600;">
      Book Your Next Stay
</a>
</div>
</td>
</tr>
 
<!-- Same footer -->
<tr>
<td align="center" style="background:#4a2f1b;color:#fff;padding:28px 20px;font-size:12px;line-height:1.6;">
<div>© 2025 COCO LIVING</div>
<!-- ... same as above ... -->
</td>
</tr>
 
</table>
</td></tr></table>
</body>
</html>
    `,
  };
}

// ----------ADMIN CREDENTIALS ----------
function adminCredentialsEmail({ fullName, email, password }) {
  return {
    attachments: [
      {
        filename: "logo.png",
        path: path.join(__dirname, "assets/logo.png"),
        cid: "logo",
      },
      {
        filename: "bg-pattern.png",
        path: path.join(__dirname, "assets/bg-pattern.png"),
        cid: "bg",
      },
    ],
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>

<body style="margin:0;background:#f3efe9;
font-family:'Rethink Sans','Inter','Segoe UI',Arial,sans-serif;">
<table width="100%" align="center">
<tr><td align="center">

<table width="420" style="max-width:420px;">

<tr>
<td align="center"
style="background-color:#4F3421;
background-image:url(cid:bg);
background-repeat:repeat;
background-size:400px 400px;
padding:28px;">
  <img src="cid:logo" width="120" />
</td>
</tr>

<tr>
<td align="center" style="background:#f3efe9;padding:32px 24px;">
  <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;">
    Admin Account Created
  </h2>

  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
    Hello <strong>${fullName}</strong>,<br/>
    Your admin account has been successfully created.
  </p>

  <div style="
    background:#ffffff;
    padding:16px;
    border-radius:12px;
    width:100%;
    font-size:14px;
    line-height:1.8;
    text-align:left;
  ">
    <strong>Login Credentials</strong><br/><br/>
    Email: <strong>${email}</strong><br/>
    Password: <strong>${password}</strong>
  </div>

  <a href="${process.env.ADMIN_LOGIN_URL}"
     style="
      display:inline-block;
      margin-top:20px;
      padding:12px 20px;
      background:#4F3421;
      color:#ffffff;
      text-decoration:none;
      border-radius:8px;
      font-size:14px;
      font-weight:600;
     ">
     Login to Admin Panel
  </a>
</td>
</tr>

<tr>
<td align="center" style="background:#4a2f1b;color:#fff;
padding:16px;font-size:11px;">
  © 2025 COCO LIVING
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
`,
  };
}

module.exports = {
  welcomeEmail,
  otpEmail,
  refundInitiatedEmail,
  refundCompletedEmail,
  adminCredentialsEmail
};