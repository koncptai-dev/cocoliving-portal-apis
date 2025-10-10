
//multer error handler function for images limit

const multer = require('multer');

function handleMulterError(uploadFn, maxFiles) {
  return function(req, res, next) {
    uploadFn(req, res, function(err) {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: `You can upload a maximum of ${maxFiles} files` });
          }
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

module.exports = handleMulterError;
