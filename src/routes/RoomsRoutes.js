const RoomController=require('../controllers/RoomsController');
const express = require('express');
const router = express.Router();
const {validateRooms,editRoomsValidate}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const upload = require('../middleware/upload');

router.post('/add',upload.array('roomImages', 5),validateRooms,validate, RoomController.AddRooms);
router.put('/edit/:id',upload.array('roomImages', 5),editRoomsValidate,validate, RoomController.EditRooms);
router.delete('/delete/:id', RoomController.DeleteRooms);
router.get('/getall', RoomController.getAllRooms);

module.exports=router