const RoomController=require('../controllers/RoomsController');
const express = require('express');
const router = express.Router();
const {validateRooms,editRoomsValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const uploadCSV = require('../middleware/uploadCsv');
const authorizeRole = require("../middleware/authorizeRole");
const authMiddleware = require('../middleware/auth');

//admin
router.post('/add',validateRooms,validate,authMiddleware, authorizeRole(1,3), RoomController.AddRooms);
router.put('/edit/:id',editRoomsValidate,validate, authMiddleware,authorizeRole(1,3), RoomController.EditRooms);
router.delete('/delete/:id',authMiddleware, authorizeRole(1,3), RoomController.DeleteRooms);
router.get('/getall',authMiddleware, authorizeRole(1,3), RoomController.getAllRooms);
router.get('/occupants/:roomId', authMiddleware, authorizeRole(1,3), RoomController.getRoomOccupants);

router.get('/getAll/:propertyId', RoomController.getRoomsByProperty);
router.get("/available/:propertyId/:roomType", RoomController.getAvailableRooms);
router.get("/inventory/:propertyId", RoomController.getInventoryForProperty);
router.post("/import/csv", authMiddleware , authorizeRole(1,3), uploadCSV.single("file"), RoomController.importRooms);
router.get("/template", authMiddleware, RoomController.downloadRoomCsvTemplate);

module.exports=router