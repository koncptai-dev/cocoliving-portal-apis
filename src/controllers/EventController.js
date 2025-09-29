const sequelize = require('../config/database');
const Events = require('../models/events');
const EventParticipation = require('../models/eventParticipation');
const User = require('../models/user');
const { Op } = require('sequelize');
const { Property } = require('../models');

//create events
exports.createEvent = async (req, res) => {
  try {
    const { title, eventDate, eventTime, location, maxParticipants, description, propertyId } = req.body;

    //validate date of event
    const eventDateObj = new Date(eventDate);
    if (isNaN(eventDateObj.getTime())) {
      return res.status(400).json({ message: "Invalid event date" });
    }
    // Validate time (HH:mm:ss)
    let validEventTime = null;
    if (eventTime) {
      if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(eventTime)) {
        return res.status(400).json({ message: "Invalid event time. Format should be HH:mm or HH:mm:ss" });
      }
      validEventTime = eventTime.length === 5 ? `${eventTime}:00` : eventTime;
    }

    //validate max participants
    if (isNaN(maxParticipants) || parseInt(maxParticipants) <= 0) {
      return res.status(400).json({ message: "Max participants must be a positive number." });
    }

    //check duplicate event (same title, date, property)
    const existingEvent = await Events.findOne({
      where: {
        title,
        eventDate: eventDateObj,
        propertyId: propertyId && propertyId !== "all" ? propertyId : null
      }
    })
    if (existingEvent) {
      return res.status(400).json({ message: "Event already exists for this property and date." });
    }

    if (!propertyId || propertyId === "all") {
      return res.status(400).json({ message: "Property must be selected for this event." });
    }

    const newEvent = await Events.create({
      title,
      eventDate: eventDateObj,
      eventTime:  validEventTime,
      location,
      maxParticipants,
      description,
      propertyId
    });
    return res.status(201).json(newEvent);
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

exports.updateEvents = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, eventDate, eventTime, location, maxParticipants, description } = req.body;

    //check event exists
    const event = await Events.findByPk(eventId, {
      include: [{ model: EventParticipation }]
    });
    if (!event) return res.status(404).json({ message: "Event not found" });

    //validate date of event const eventDateObj = eventDate ? new Date(eventDate) : event.eventDate;
    const eventDateObj = eventDate ? new Date(eventDate) : event.eventDate;
    if (eventDate && isNaN(eventDateObj.getTime())) { return res.status(400).json({ message: "Invalid event date" }); }

    // Validate time
    let validEventTime = event.eventTime;
    if (eventTime !== undefined) {
      if (!eventTime) {
        validEventTime = null; // allow clearing
      } else if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(eventTime)) {
        return res.status(400).json({ message: "Invalid event time. Format should be HH:mm or HH:mm:ss" });
      } else {
        validEventTime = eventTime.length === 5 ? `${eventTime}:00` : eventTime;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // ignore time for comparison
    const isEditing = !!event;
    const eventDateOnly = new Date(eventDateObj);
    eventDateOnly.setHours(0, 0, 0, 0);
    if (!isEditing && eventDateOnly < today) { return res.status(400).json({ message: "Event date cannot be in the past." }); }

    //validate max participants
    if (maxParticipants && (isNaN(maxParticipants) || parseInt(maxParticipants) <= 0)) { return res.status(400).json({ message: "Max participants must be a positive number." }); }

    const duplicateEvent = await Events.findOne({
      where: {
        title: title ?? event.title,
        eventDate: eventDate ? eventDateObj : event.eventDate,
        id: { [Op.ne]: eventId }
      }
    });

    if (duplicateEvent) {
      return res.status(400).json({ message: "Event already exists for this property and date." });
    }

    await event.update({
      title: title ?? event.title,
      eventDate: eventDate ? eventDateObj : event.eventDate,
      eventTime: validEventTime,
      location: location ?? event.location,
      maxParticipants: maxParticipants ?? event.maxParticipants,
      description: description ?? event.description,
    });

    return res.status(200).json({ message: "Event updated successfully", event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

//delte event
exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Events.findByPk(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    await event.destroy();
    return res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// exports.getEventParticipants = async (req, res) => {
//   try {
//     const events = await Events.findAll({
//       include: [{
//           model: EventParticipation,
//           include: [{
//               model: User, attributes: ["id", "fullName"]},]},
//         {
//           model: Property,
//           as: "property",
//           attributes: ["id", "name"]
//         }
//       ]
//     });

//     // const allUsers = await User.findAll({ where: { userType: { [Op.ne]: 'admin' } }, attributes: ["id", "fullName"] });

//     const formatted = events.map(event => {
//       // const joinedUsersIds = event.EventParticipations.map(p => p.User?.id);

//       //user based on property filter
//       // let filteredUsers = event.propertyId ? allUsers.filter(u => u.propertyId === event.propertyId) : allUsers;

//       // Combine joined and not-joined users
//       // const participantsData = [
//       //   ...event.EventParticipations.map(p => ({
//       //     name: p.User?.fullName, status: p.status === "active" ? "active" : "inactive"
//       //   })),
//       //   ...filteredUsers.filter(u => !joinedUsersIds.includes(u.id))
//       //     .map(u => ({
//       //       name: u.fullName,
//       //       status: "inactive"
//       //     }))
//       // ];

//       // For each participant, create a separate event object
//       return {
//         id: event.id,
//         title: event.title,
//         eventDate: event.eventDate,
//         location: event.location,
//         maxParticipants: event.maxParticipants,
//         is_active: event.is_active,
//         property: event.property ? { id: event.property.id, name: event.property.name } : "NA",
//         // participants: participantsData,
//         description: event.description || ''
//       };
//     });

//     res.json(formatted);

//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

exports.getAllEvents = async (req, res) => {
  try {
    const events = await Events.findAll({
      include: [{
        model: EventParticipation,
        include: [{
          model: User, attributes: ["id", "fullName"]
        },]
      },
      {
        model: Property,
        as: "property",
        attributes: ["id", "name"]
      }
      ]
    });
    const formatted = events.map(event => {
      return {
        id: event.id,
        title: event.title,
        eventDate: event.eventDate,
        eventTime: event.eventTime,
        location: event.location,
        maxParticipants: event.maxParticipants,
        is_active: event.is_active,
        property: event.property ? { id: event.property.id, name: event.property.name } : "NA",
        description: event.description || ''
      };
    });

    res.json(formatted);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

exports.toggleEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Events.findByPk(id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Toggle the is_active field
    event.is_active = !event.is_active;
    await event.save();

    return res.json({ message: 'Event Status Is updated', event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};