const express = require('express');
const { sendContactEmail } = require('../utils/emailService');

const router = express.Router(); 

router.post('/send', async (req, res) => {
  const { name, email, phone, message } = req.body;

  try {
    await sendContactEmail(name, email, phone, message);
    res.status(200).json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

module.exports = router;
