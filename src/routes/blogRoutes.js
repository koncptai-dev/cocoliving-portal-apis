const express = require('express');
const router = express.Router();

const upload = require('../middleware/upload');
const blogController = require('../controllers/blogController');
const { body } = require('express-validator');

// CREATE
router.post(
  '/',
  upload.single('thumbnail'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('url').trim().notEmpty().withMessage('URL is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('status').optional().isIn(['draft', 'published', 'live', 'inactive']),
  ],
  blogController.createBlog
);

// READ ALL
router.get('/', blogController.getAllBlogs);

// READ ONE
router.get('/:id', blogController.getBlogById);

// UPDATE
router.put(
  '/:id',
  upload.single('thumbnail'),
  [
    body('title').optional().trim().notEmpty(),
    body('url').optional().trim().notEmpty(),
    body('content').optional().trim().notEmpty(),
    body('status').optional().isIn(['draft', 'published', 'live', 'inactive']),
  ],
  blogController.updateBlog
);

// DELETE
router.delete('/:id', blogController.deleteBlog);

module.exports = router;