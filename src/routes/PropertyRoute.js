const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const propertyController=require('../controllers/propertyController');
const {validateProperty,editPropertyValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');
const authorizeRole = require("../middleware/authorizeRole");
const authorizePage = require("../middleware/authorizePage");

// admin
router.post("/add", upload.any(),validateProperty, validate, authMiddleware,authorizeRole(1,3),authorizePage("Property Management","write"), propertyController.createProperty);
router.get("/getAll",authMiddleware, propertyController.getProperties);
router.put("/edit/:id",upload.any(),editPropertyValidate, validate, authMiddleware, authorizeRole(1,3), authorizePage("Property Management","write"), propertyController.editProperties);
router.delete("/delete/:id", authMiddleware, authorizeRole(1,3), authorizePage("Property Management","write"), propertyController.deleteProperty);
router.delete("/deleteRateCard", authMiddleware, authorizeRole(1,3), authorizePage("Property Management","write"), propertyController.deleteRateCard);
router.delete("/deleteFloorLayout", authMiddleware, authorizeRole(1,3), authorizePage("Property Management","write"), propertyController.deleteFloorLayout);

//for user
router.get("/getPropertiesForUser", propertyController.getPropertiesForUser);

module.exports = router;
