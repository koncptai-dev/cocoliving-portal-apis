const { validationResult } = require('express-validator');
const models = require('../models');     // ← this is your index.js
const Blog = models.Blog;                // ← now Blog is the real model

// ────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────
exports.createBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

   const { 
  title, 
  url, 
  content, 
  status,
  metaTitle,
  metaDescription,
  customCss,
  customJs, 
  altText
} = req.body;

    let thumbnail = null;
    // if (req.file) {
    //   thumbnail = `/uploads/blogs/${req.file.filename}`;
    // }
    if (req.file) {
  console.log('[CONTROLLER] File received:', req.file.originalname, '→', req.file.path);
  thumbnail = `/uploads/blogs/${req.file.filename}`;
} else {
  console.log('[CONTROLLER] No thumbnail file received');
}

    const blog = await Blog.create({
  title: title.trim(),
  url: url.trim(),
  content,
  thumbnail,
  status: status || 'draft',

  metaTitle,
  metaDescription,
  customCss,
  customJs,
  altText,
});

    return res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });
  } catch (error) {
    console.error('Create blog error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create blog',
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────
// GET ALL (with optional status filter)
// ────────────────────────────────────────────────
exports.getAllBlogs = async (req, res) => {
  try {
    const { status } = req.query;

    const where = status ? { status } : {};

    const blogs = await Blog.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    console.error('Get blogs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
    });
  }
};

// ────────────────────────────────────────────────
// GET ONE
// ────────────────────────────────────────────────
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    return res.json({
      success: true,
      data: blog,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// ────────────────────────────────────────────────
// UPDATE
// ────────────────────────────────────────────────
exports.updateBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const blog = await Blog.findByPk(req.params.id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const { 
  title, 
  url, 
  content, 
  status,
  metaTitle,
  metaDescription,
  customCss,
  customJs,
  altText
} = req.body;

    if (req.file) {
      blog.thumbnail = `/uploads/blogs/${req.file.filename}`;
    }

    if (title)    blog.title   = title.trim();
    if (url)      blog.url     = url.trim();
    if (content)  blog.content = content;
    if (status)   blog.status  = status;
    if (metaTitle) blog.metaTitle = metaTitle;
    if (metaDescription) blog.metaDescription = metaDescription;
    if (customCss) blog.customCss = customCss;
    if (customJs) blog.customJs = customJs;
    if (altText !== undefined) blog.altText = altText;

    await blog.save();

    return res.json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });
  } catch (error) {
    console.error('Update blog error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update blog',
    });
  }
};

// ────────────────────────────────────────────────
// DELETE
// ────────────────────────────────────────────────
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    await blog.destroy();

    return res.json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete blog',
    });
  }
};

exports.getPublicBlogs = async (req, res) => {
  try {
    const blogs = await Blog.findAll({
      where: { status: 'published' },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'url', 'thumbnail', 'createdAt', 'status'], // no full content needed here
    });

    return res.json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    console.error('Public blogs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch public blogs',
    });
  }
};

// ────────────────────────────────────────────────
// PUBLIC: Get single blog by URL/slug (no auth needed)
// ────────────────────────────────────────────────
exports.getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({
      where: {
        url: req.params.url,
        status: 'published',
      },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found or not published',
      });
    }

    return res.json({
      success: true,
      data: blog,
    });
  } catch (error) {
    console.error('Public blog by slug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};