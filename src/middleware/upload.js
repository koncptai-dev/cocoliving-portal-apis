const multer=require('multer');
const path=require('path');
const fs=require('fs');

const uploadDir=path.join(__dirname,'..','uploads','profilePicture');
if(!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir,{recursive:true});
}

//config storage
const storage=multer.diskStorage({
    destination:function(req,file,cb){
        cb(null,uploadDir);   //imgs stores in upload directory /upload/profilePicture
    },
    filename:function(req,file,cb){
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Rename file with timestamp
    }
});

//file filter allow only images
const fileFilter=(req,file,cb)=>{
    const allowedTypes=/jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        return cb(new Error('Only images (JPEG, JPG, PNG ) are allowed!'), false);
    }

}

// Initialize Multer
const upload = multer({
  storage: storage, 
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});

module.exports = upload;