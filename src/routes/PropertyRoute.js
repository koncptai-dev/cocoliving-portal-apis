const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const propertyController=require('../controllers/propertyController');
const {validateProperty,editPropertyValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');


router.post("/add", upload.array('propertyImages', 20),validateProperty, validate, authMiddleware, propertyController.createProperty);
router.get("/getAll", propertyController.getProperties);
router.put("/edit/:id",upload.array('propertyImages', 20),editPropertyValidate, validate, authMiddleware, propertyController.editProperties);
router.delete("/delete/:id", authMiddleware, propertyController.deleteProperty);
module.exports = router;
