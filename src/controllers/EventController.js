const sequelize = require('../config/database');
const Events = require('../models/events');
const EventParticipation = require('../models/eventParticipation');
const User=require('../models/user');
const { Op } = require('sequelize');

//create events
exports.createEvent = async (req, res) => {
    try {
        const { title, eventDate, Location, maxParticipants, description } = req.body;


        //validate date of event
        const eventDateObj = new Date(eventDate);
        if (isNaN(eventDateObj.getTime())) {
            return res.status(400).json({ message: "Invalid event date" });
        }

        //prevent from past date
        // const today = new Date();
        // today.setHours(0, 0, 0, 0);
        // if (eventDateObj < today) {
        //     return res.status(400).json({ message: "Event date cannot be in the past" });
        // }

        //validate max participants
        if (isNaN(maxParticipants) || parseInt(maxParticipants) <= 0) {
            return res.status(400).json({ message: "Max participants must be a positive number." });
        }

        const newEvent = await Events.create({
            title,
            eventDate: eventDateObj,
            Location,
            maxParticipants,
            description
        });
        return res.status(201).json(newEvent);
    } catch (err) {
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getEventParticipants = async (req, res) => {
  try {
   const events=await Events.findAll({
    include:[
      {
        model: EventParticipation,
        include: [
          {
            model: User,
            attributes:["id","fullName"]
          }
        ]
      }
    ]
   });

    const allUsers = await User.findAll({ attributes: ["id", "fullName"] });

    const formatted = events.flatMap(event => {
      const joinedUsersIds = event.EventParticipations.map(p => p.User?.id);

      // Combine joined and not-joined users
      const participantsData = [
        ...event.EventParticipations.map(p => ({
          name: p.User?.fullName,
          status: p.status || "attending"
        })),
        ...allUsers
          .filter(u => !joinedUsersIds.includes(u.id))
          .map(u => ({
            name: u.fullName,
            status: "not_attending"
          }))
      ];

      // For each participant, create a separate event object
      return participantsData.map(participant => ({
        id: event.id,
        title: event.title,
        date: event.eventDate,
        location: event.Location,
        participants: participant.name,
        status: participant.status
      }));
    });

    res.json(formatted);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
