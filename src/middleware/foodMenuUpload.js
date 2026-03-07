const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads", "foodMenus");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpg|jpeg|png|bmp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = /image\/jpeg|image\/jpg|image\/png|image\/bmp/.test(file.mimetype);

  if (!ext || !mime) {
    return cb(new Error("Only JPG, JPEG, PNG, BMP images allowed"));
  }

  cb(null, true);
};

const uploadFoodImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, 
  },
}).array("photos", 3); 

module.exports = uploadFoodImages;