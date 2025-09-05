const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Property = require('../models/property');
const e = require('express');

exports.createProperty = async (req, res) => {
  try {
    const { name, address, description, images, amenities, is_active } = req.body;

    const existing = await Property.findOne({ where: { name, address } });

    if (existing) {
      return res.status(400).json({ message: "Property already exists" });
    }

    // Ensure images and amenities are arrays
    const imagesArray = Array.isArray(images) ? images : images?.split(",").map(img => img.trim()) || [];
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || [];

    const property = await Property.create({
      name,
      address,
      description,
      images: imagesArray,
      amenities: amenitiesArray,
      is_active: is_active,

    });
    res.status(201).json({ message: "Property created successfully", property });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create property" });
  }
}

exports.getProperties = async (req, res) => {
  try {
    const properties = await Property.findAll({ order: [["createdAt", "DESC"]] });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties" });
  }
};

exports.editProperties = async (req, res) => {

  try {
    const { id } = req.params;
    const { name, address, description, images, amenities, is_active } = req.body;

    const property=await Property.findByPk(id);
    if(!property){
      return res.status(404).json({message:"Property not found"});
    }

    //check another property with same name 
    if(name){
      const existing=await Property.findOne({
        where:{
          name,id:{[Op.ne]:id}
        }
      })
      if(existing){
        return res.status(400).json({message:"Property with same name already exists"});
      }
    }
    // Ensure images and amenities are arrays
    const imagesArray = Array.isArray(images) ? images : images?.split(",").map(img => img.trim()) || property.images;
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities?.split(",").map(a => a.trim()) || property.amenities;

    await property.update({
      name: name ?? property.name,
      address: address ?? property.address,
      description: description ?? property.description,
      images: images !== undefined ? imagesArray : property.images,
      amenities: amenities !== undefined ? amenitiesArray : property.amenities,
      is_active: is_active !== undefined ? is_active : property.is_active,
    });
    res.status(200).json({ message: "Property updated successfully", property });

  }catch(err){
    console.error(err);
    res.status(500).json({message:"Failed to update property"});
  }

}

exports.deleteProperty = async (req, res) => {
  try{
    const {id}=req.params;

    const property=await Property.findByPk(id);
    if(!property){
      return res.status(404).json({message:"Property not found"});
    }

    await property.destroy();

    res.status(200).json({message:"Property deleted successfully"});
  }catch(err){
    console.error(err);
    res.status(500).json({message:"Failed to delete property"});
  }
}