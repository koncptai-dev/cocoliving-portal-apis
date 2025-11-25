const RoomController=require('../controllers/RoomsController');
const express = require('express');
const router = express.Router();
const {validateRooms,editRoomsValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');

router.post('/add',upload.array('roomImages', 20),validateRooms,validate, RoomController.AddRooms);
router.put('/edit/:id',upload.array('roomImages', 20),editRoomsValidate,validate, RoomController.EditRooms);
router.delete('/delete/:id', RoomController.DeleteRooms);
router.get('/getall', RoomController.getAllRooms);
router.get('/getAll/:propertyId', RoomController.getRoomsByProperty);
router.get("/available/:propertyId/:roomType", RoomController.getAvailableRooms);
router.post("/assign/:roomId", RoomController.assignInventoryManual);
router.post("/auto-assign/:roomId", RoomController.assignInventoryAuto);
router.get("/inventory/:propertyId", RoomController.getInventoryForProperty);

module.exports=router