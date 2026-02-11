const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { sendJobApplicationEmail } = require("../utils/emailService");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/apply", upload.single("resume"), async (req, res) => {
  try {
    const { firstName, lastName, email, contact, experience, position } =
      req.body;
    const resumeFile = req.file;

    if (!resumeFile) {
      return res.status(400).json({ message: "Resume file is required." });
    }

    const applicant = {
      firstName,
      lastName,
      email,
      contact,
      experience,
      position,
      resumePath: resumeFile.path,
      resumeName: resumeFile.originalname,
    };

    await sendJobApplicationEmail(applicant);

    res
      .status(200)
      .json({ success: true, message: "Application submitted successfully." });
  } catch (err) {
    console.error("Error submitting application:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to submit application." });
  }
});

module.exports = router;
