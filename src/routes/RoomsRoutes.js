const RoomController=require('../controllers/RoomsController');
const express = require('express');
const router = express.Router();
const {validateRooms,editRoomsValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');
const authorizeRole = require("../middleware/authorizeRole");
const authMiddleware = require('../middleware/auth');

//admin
router.post('/add',validateRooms,validate,authMiddleware, authorizeRole(1,3), RoomController.AddRooms);
router.put('/edit/:id',editRoomsValidate,validate, authMiddleware,authorizeRole(1,3), RoomController.EditRooms);
router.delete('/delete/:id', authorizeRole(1,3), RoomController.DeleteRooms);
router.get('/getall', authorizeRole(1,3), RoomController.getAllRooms);

router.get('/getAll/:propertyId', RoomController.getRoomsByProperty);
router.get("/available/:propertyId/:roomType", RoomController.getAvailableRooms);
router.post("/assign/:roomId", RoomController.assignInventoryManual);
router.post("/auto-assign/:roomId", RoomController.assignInventoryAuto);
router.get("/inventory/:propertyId", RoomController.getInventoryForProperty);

module.exports=router