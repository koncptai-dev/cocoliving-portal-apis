const EventController = require('../controllers/EventController')
const express = require('express');
const   router = express.Router();
const authMiddleware = require('../middleware/auth');
const {validateEvent}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const { joinEvent, getEvents } = require("../controllers/participationController");
const upload = require('../middleware/upload');


//add event by admin
router.post('/add',upload.single('eventImage'),validateEvent, validate, authMiddleware, EventController.createEvent);

//edit event by admin
router.put('/edit/:eventId',upload.single('eventImage'), authMiddleware, EventController.updateEvents);

//patch request to update event status
router.patch('/:id/toggle-status', EventController.toggleEventStatus);

//get Events by admin
router.get('/admin/getAllEvents', authMiddleware, EventController.getAllEvents);

//delete event by admin
router.delete('/delete/:eventId', authMiddleware, EventController.deleteEvent);

// admin list dekhega
// router.get("/admin/eventparticipants", EventController.getEventParticipants);

// user join karega
router.post("/:eventId/join", joinEvent);

// Get all events user
router.get("/allevents",authMiddleware, getEvents);


module.exports = router