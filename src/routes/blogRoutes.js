// const express = require('express');
// const router = express.Router();
// const authenticateToken = require('../middleware/auth');
// const upload = require('../middleware/upload');
// const blogController = require('../controllers/blogController');
// const { body } = require('express-validator');

// // ────────────────────────────────────────────────
// // PUBLIC ROUTES – NO AUTH REQUIRED – MUST BE FIRST
// // ────────────────────────────────────────────────
// router.get('/public', blogController.getPublicBlogs);
// router.get('/public/:url', blogController.getBlogBySlug);

// // ────────────────────────────────────────────────
// // PROTECTED ROUTES – REQUIRE JWT TOKEN
// // ────────────────────────────────────────────────
// router.use(authenticateToken);   // ← this now only applies to routes BELOW it

// // CREATE
// router.post(
//   '/',
//   upload.single('thumbnail'),
//   [
//     body('title').trim().notEmpty().withMessage('Title is required'),
//     body('url').trim().notEmpty().withMessage('URL is required'),
//     body('content').trim().notEmpty().withMessage('Content is required'),
//     body('status').optional().isIn(['draft', 'published', 'inactive']),
//   ],
//   blogController.createBlog
// );

// // READ ALL (admin)
// router.get('/', blogController.getAllBlogs);

// // READ ONE (admin)
// router.get('/:id', blogController.getBlogById);

// // UPDATE
// router.put(
//   '/:id',
//   upload.single('thumbnail'),
//   [
//     body('title').optional().trim().notEmpty(),
//     body('url').optional().trim().notEmpty(),
//     body('content').optional().trim().notEmpty(),
//     body('status').optional().isIn(['draft', 'published', 'inactive']),
//   ],
//   blogController.updateBlog
// );

// // DELETE
// router.delete('/:id', blogController.deleteBlog);

// module.exports = router;

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');   // your existing multer middleware
const blogController = require('../controllers/blogController');
const { body } = require('express-validator');

// ────────────────────────────────────────────────
// PUBLIC ROUTES
// ────────────────────────────────────────────────
router.get('/public', blogController.getPublicBlogs);
router.get('/public/:url', blogController.getBlogBySlug);

// ────────────────────────────────────────────────
// NEW: CKEditor Image Upload (Protected)
// ────────────────────────────────────────────────
router.post(
  '/upload-image',
  authenticateToken,
  upload.single('upload'),     // ← Important: field name must be 'upload'
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
      }

      const imageUrl = `/uploads/blogs/${req.file.filename}`;

      console.log('[CKEditor Upload Success] →', imageUrl);

      // CKEditor expects this format
      res.json({
        url: `${process.env.API_BASE_URL || 'http://localhost:5001'}${imageUrl}`
      });
    } catch (err) {
      console.error('CKEditor image upload error:', err);
      res.status(500).json({ message: 'Image upload failed' });
    }
  }
);

// ────────────────────────────────────────────────
// PROTECTED ROUTES (apply auth to all below)
// ────────────────────────────────────────────────
router.use(authenticateToken);

// CREATE
router.post(
  '/',
  upload.single('thumbnail'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('url').trim().notEmpty().withMessage('URL is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
  ],
  blogController.createBlog
);

// ... rest of your routes (GET, PUT, DELETE) remain the same
router.get('/', blogController.getAllBlogs);
router.get('/:id', blogController.getBlogById);

router.put(
  '/:id',
  upload.single('thumbnail'),
  [
    body('title').optional().trim().notEmpty(),
    body('url').optional().trim().notEmpty(),
    body('content').optional().trim().notEmpty(),
    body('status').optional().isIn(['draft', 'published', 'inactive']),
  ],
  blogController.updateBlog
);

router.delete('/:id', blogController.deleteBlog);

module.exports = router;