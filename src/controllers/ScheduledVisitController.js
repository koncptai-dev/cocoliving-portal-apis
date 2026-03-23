const axios = require('axios');
const ScheduledVisit = require('../models/scheduledVisit');
const { logApiCall } = require('../helpers/auditLog');
const { mailsender } = require('../utils/emailService');
const { scheduledVisitEmail } = require("../utils/emailTemplates/emailTemplates");
const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS;
if (!adminEmails) {
  console.error('ADMIN_NOTIFICATION_EMAILS is not set in .env');
}
const emailList = adminEmails.split(',').map(e => e.trim());
exports.createScheduledVisit = async (req, res) => {
  try {
    const { name, email, phone, visitDate, recaptchaToken } = req.body;

    // ────────────────────────────────────────────────
    // 1. Basic field validation + require token
    // ────────────────────────────────────────────────
    if (!name || !email || !phone || !visitDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!recaptchaToken) {
      return res.status(400).json({ message: 'reCAPTCHA token is required' });
    }

    // ────────────────────────────────────────────────
    // 2. Verify reCAPTCHA with Google
    // ────────────────────────────────────────────────
    const secret = process.env.RECAPTCHA_SECRET_KEY;

    if (!secret) {
      console.error('RECAPTCHA_SECRET_KEY is not set in .env');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';

    const verificationResponse = await axios.post(verificationUrl, null, {
      params: {
        secret: secret,
        response: recaptchaToken,
        remoteip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
      },
    });
// console.log(verificationResponse);
    const verificationData = verificationResponse.data;

    if (!verificationData.success) {
      console.warn('reCAPTCHA verification failed:', verificationData['error-codes']);
      return res.status(403).json({ 
        message: 'reCAPTCHA verification failed. Please try again.' 
      });
    }

    // Score check (1.0 = human, 0.0 = bot)
    // Start conservative — you can lower it later if real users get blocked
    const MIN_SCORE = 0.4;   // ← 0.4–0.5 is common starting point

    if (verificationData.score < MIN_SCORE) {
      console.warn(`Low reCAPTCHA score: ${verificationData.score} | IP: ${req.ip} | Email: ${email}`);
      return res.status(403).json({ 
        message: 'Verification failed - suspicious activity detected' 
      });
    }
console.log('Received action from Google:', verificationData.action);  // ← key line!
    // Optional: check action name (must match what you used in frontend)
    // if (verificationData.action !== 'book_a_visit') {
    //   return res.status(403).json({ message: 'Invalid reCAPTCHA action' });
    // }
if (verificationData.action !== 'book_a_visit') {
  console.warn('Action mismatch! Expected: book_a_visit | Got:', verificationData.action);
  return res.status(403).json({ message: 'Invalid reCAPTCHA action' });
}
    

    // ────────────────────────────────────────────────
    // 3. Your existing date check
    // ────────────────────────────────────────────────
    const visitDay = new Date(visitDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    // ────────────────────────────────────────────────
    // 4. Create the record (only reaches here if captcha passed)
    // ────────────────────────────────────────────────
    const visit = await ScheduledVisit.create({
      name,
      email,
      phone,
      visitDate,
    });

    // ────────────────────────────────────────────────
    // 5. Email + logging (your original code)
    // ────────────────────────────────────────────────
    const { html, attachments } = scheduledVisitEmail({
      name,
      visitDate,
    });

    await mailsender(
      `${email}`,
      "Visit Approved - Coco Living",
      html,
      attachments
    );
    const adminHtml = `
    <p>A new visit request has been submitted.</p>

    <p>
    <strong>Name:</strong> ${name}<br/>
    <strong>Email:</strong> ${email}<br/>
    <strong>Phone:</strong> ${phone}<br/>
    <strong>Visit Date:</strong> ${new Date(visitDate).toLocaleDateString('en-IN')}
    </p>

    <p>Please review and take action from the admin panel.</p>
    `;

    await mailsender(
      emailList,
      "New Visit Request - Action Required",
      adminHtml
    );
    await logApiCall(req, res, 201, `Scheduled visit created (ID: ${visit.id})`, 'scheduledVisit', visit.id);

    return res.status(201).json({
      message: 'Visit scheduled successfully',
      visit,
    });

  } catch (err) {
    console.error('Error in createScheduledVisit:', err);
    await logApiCall(req, res, 500, 'Error creating scheduled visit', 'scheduledVisit');
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createScheduledVisitFromApp = async (req, res) => {
  try {
    const { name, email, phone, visitDate } = req.body;

    if (!name || !email || !phone || !visitDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const visitDay = new Date(visitDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (visitDay < today) {
      return res.status(400).json({ message: 'Visit date cannot be in the past' });
    }

    const visit = await ScheduledVisit.create({
      name,
      email,
      phone,
      visitDate,
    });

    const { html, attachments } = scheduledVisitEmail({
      name,
      visitDate,
    });

    await mailsender(
      `${email}`,
      "Visit Approved - Coco Living",
      html,
      attachments
    );

    const adminHtml = `
      <p>A new visit request has been submitted.</p>

      <p>
      <strong>Name:</strong> ${name}<br/>
      <strong>Email:</strong> ${email}<br/>
      <strong>Phone:</strong> ${phone}<br/>
      <strong>Visit Date:</strong> ${new Date(visitDate).toLocaleDateString('en-IN')}
      </p>

      <p>Please review and take action from the admin panel.</p>
    `;

    await mailsender(
      emailList,
      "New Visit Request - Action Required",
      adminHtml
    );

    await logApiCall(
      req,
      res,
      201,
      `Scheduled visit created (ID: ${visit.id})`,
      'scheduledVisit',
      visit.id
    );

    return res.status(201).json({
      message: 'Visit scheduled successfully',
      visit,
    });

  } catch (err) {
    console.error('Error in createScheduledVisit:', err);
    await logApiCall(req, res, 500, 'Error creating scheduled visit', 'scheduledVisit');
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getScheduledVisitList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: visits } = await ScheduledVisit.findAndCountAll({
      order: [
        ["visitDate", "DESC"],
      ],
      limit, offset
    });

    return res.status(200).json({ success: true, total: count, page, totalPages: Math.ceil(count / limit), data: visits, });
  } catch (error) {
    console.error("Schedule Visit List Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch schedule visit list", });
  }
};
exports.updateScheduledVisitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const visit = await ScheduledVisit.findByPk(id);

    if (!visit) {
      return res.status(404).json({ message: 'Visit not found' });
    }

    if (visit.status === 'approved') {
      return res.status(400).json({ message: 'This visit is already approved' });
    }

    if (visit.status === 'denied') {
      return res.status(400).json({ message: 'This visit is already denied' });
    }

    visit.status = status;
    await visit.save();

    // // EMAIL CONTENT
    // let subject = '';
    // let html = '';

    // if (status === 'approved') {
    //   subject = 'Visit Request Approved';
    //   html = `
    //     <p>Dear ${visit.name},</p>
    //     <p>Your request to visit our property has been approved.</p>
    //     <p>Please visit during working hours on ${visit.visitDate}.</p>
    //     <p>Regards,<br/>COCO Living Team</p>
    //   `;
    // } else {
    //   subject = 'Visit Request Denied';
    //   html = `
    //     <p>Dear ${visit.name},</p>
    //     <p>Due to some reason we will not be able to help you visit our site on ${visit.visitDate}.</p>
    //     <p>Please select another date and we will try to accommodate your visit.</p>
    //     <p>Regards,<br/>COCO Living Team</p>
    //   `;
    // }

    // await mailsender(visit.email, subject, html);

    return res.status(200).json({
      message: `Visit ${status} successfully`,
      visit
    });

  } catch (error) {
    console.error('Update visit status error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};