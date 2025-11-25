const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uploadDir = path.join(__dirname, "../uploads/csv");


// ✅ Ensure directory exists before use
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + path.extname(file.originalname);
    cb(null, fileName);
  },
});

// ✅ File filter to only allow CSV
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed!"), false);
  }
};
const uploadCSV = multer({ storage, fileFilter });

module.exports = uploadCSV;