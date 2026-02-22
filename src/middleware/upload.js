const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

//config storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let folder = 'others';
        if (file.fieldname === 'profileImage') folder = 'profilePicture';
        else if (file.fieldname.startsWith('propertyImages')) folder = 'propertyImages';
        else if (file.fieldname.startsWith('roomImages_')) folder = 'roomImages';
        else if (file.fieldname === 'ticketImage') folder = 'ticketImages';
        else if (file.fieldname === 'ticketVideo') folder = 'ticketVideos';
        else if (file.fieldname === 'eventImage') folder = 'eventImages';
        else if (file.fieldname === 'aadhaar_front' || file.fieldname === 'aadhaar_back' || file.fieldname === 'pan_image') folder = 'kycDocuments';
        else if (file.fieldname === 'photos')
            folder = 'dailyCleaning';
        else if(file.fieldname === 'signature') folder = 'contracts';

        const uploadDir = path.join(__dirname, '..', 'uploads', folder);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        cb(null, uploadDir);   //imgs stores in upload directory /upload/profilePicture
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Rename file with timestamp
    }
});

//file filter allow only images
const fileFilter = (req, file, cb) => {
    if (['profileImage', 'roomImages', 'propertyImages', 'ticketImage', 'eventImage'].includes(file.fieldname) || file.fieldname.startsWith('roomImages_')) {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (!extname || !mimetype) return cb(new Error('Only images (JPEG, JPG, PNG) are allowed!'));

        // check image size <= 5MB
        if (file.size > 5 * 1024 * 1024) return cb(new Error('Image exceeds 5MB limit!'));
        return cb(null, true);
    } else if (file.fieldname === 'ticketVideo') {
        const allowedTypes = /mp4|mov|avi|mkv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (!extname || !mimetype) return cb(new Error('Only videos (MP4, MOV, AVI, MKV) are allowed!'));

        // check video size <= 50MB
        if (file.size > 50 * 1024 * 1024) return cb(new Error('Video exceeds 50MB limit!'));
        return cb(null, true);
    } else {
        cb(null, true);
    }
}

// Initialize Multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
});

module.exports = upload;