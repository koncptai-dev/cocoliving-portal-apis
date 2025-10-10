const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Page = require('../models/page');

exports.createPage = async (req, res) => {
    try {
        const { page_name } = req.body;
        if (!page_name) {
            return res.status(400).json({ message: 'Page name is required' });
        }
        const newPage = await Page.create({ page_name });
        res.status(201).json({ success: true, page: newPage });
    } catch (err) {
        res.status(500).json({ message: 'Error creating page', error: err.message });
    }
}   

exports.getPages = async (req, res) => {
  try {
    const pages = await Page.findAll();
    res.status(200).json({ success: true, pages });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching pages', error: err.message });
  }
}