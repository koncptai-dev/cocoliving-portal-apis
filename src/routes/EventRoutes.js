const EventController = require('../controllers/EventController')
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {validateEvent}=require('../middleware/validation');
const validate=require('../middleware/validateResult');
const { joinEvent, getEvents } = require("../controllers/participationController");


router.post('/add',validateEvent, validate, authMiddleware, EventController.createEvent);

// user join karega
router.post("/:eventId/join", joinEvent);

// admin list dekhega
router.get("/admin/eventparticipants", EventController.getEventParticipants);

// Get all events with participants
router.get("/allevents", getEvents);


module.exports = router