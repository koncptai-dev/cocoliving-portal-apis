const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const propertyController=require('../controllers/propertyController');
const {validateProperty,editPropertyValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');


router.post("/add", validateProperty, validate, authMiddleware, propertyController.createProperty);
router.get("/getAll", propertyController.getProperties);
router.put("/edit/:id", editPropertyValidate, validate, authMiddleware, propertyController.editProperties);
router.delete("/delete/:id", authMiddleware, propertyController.deleteProperty);
module.exports = router;
