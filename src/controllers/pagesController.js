const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Page = require('../models/page');

exports.createPage = async (req, res) => {
    try {
        const { page_name } = req.body;
        if (!page_name) {
            await logApiCall(req, res, 400, "Created page - page name required", "page");
            return res.status(400).json({ message: 'Page name is required' });
        }
        const newPage = await Page.create({ page_name });
        await logApiCall(req, res, 201, `Created new page: ${page_name} (ID: ${newPage.id})`, "page", newPage.id);
        res.status(201).json({ success: true, page: newPage });
    } catch (err) {
        await logApiCall(req, res, 500, "Error occurred while creating page", "page");
        res.status(500).json({ message: 'Error creating page', error: err.message });
    }
}   

exports.getPages = async (req, res) => {
  try {
    const pages = await Page.findAll();
    await logApiCall(req, res, 200, "Viewed pages list", "page");
    res.status(200).json({ success: true, pages });
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while fetching pages", "page");
    res.status(500).json({ message: 'Error fetching pages', error: err.message });
  }
}