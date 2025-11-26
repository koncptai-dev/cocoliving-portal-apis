const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const propertyController=require('../controllers/propertyController');
const {validateProperty,editPropertyValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');


router.post("/add", upload.any(),validateProperty, validate, authMiddleware, propertyController.createProperty);
router.get("/getAll", propertyController.getProperties);
router.put("/edit/:id",upload.any(),editPropertyValidate, validate, authMiddleware, propertyController.editProperties);
router.delete("/delete/:id", authMiddleware, propertyController.deleteProperty);
router.post("/checkRateCardDeletion",authMiddleware,propertyController.checkRateCardDeletion);

module.exports = router;
