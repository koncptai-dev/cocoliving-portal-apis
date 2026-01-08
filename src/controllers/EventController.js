const sequelize = require('../config/database');
const Events = require('../models/events');
const Booking = require('../models/bookRoom');
const EventParticipation = require('../models/eventParticipation');
const User = require('../models/user');
const { Op } = require('sequelize');
const { Property } = require('../models');
const { logApiCall } = require("../helpers/auditLog");
const fs = require('fs');
const path = require('path');
const { sendPushNotification } = require("../helpers/notificationHelper");

// Helper to send notifications for an event
async function notifyEventUsers(event, action = 'created') {
  let users;

  if (event.propertyId === 'all') {
    // All users with at least one booking
    users = await User.findAll({
      include: [{
        model: Booking,
        as: 'bookings',
        required: true
      }]
    });
  } else {
    // Users who have a booking for the specific property
    users = await User.findAll({
      include: [{
        model: Booking,
        as: 'bookings',
        where: { propertyId: event.propertyId },
        required: true
      }]
    });
  }
  const title = action === 'created' ? "New Event Created" : "Event Updated";

  for (const user of users) {
    if (!user.fcmToken) continue;
    await sendPushNotification(
      user.id,
      title,
      `Event "${event.title}" scheduled on ${new Date(event.eventDate).toDateString()} at ${event.location}`,
      { eventId: event.id.toString(), type: "event" },
      "event"
    );
  }
}

//create events
exports.createEvent = async (req, res) => {
  try {
    const { title, eventDate, eventTime, location, maxParticipants, description, propertyId } = req.body;

    //validate date of event
    const eventDateObj = new Date(eventDate);
    if (isNaN(eventDateObj.getTime())) {
      await logApiCall(req, res, 400, "Created event - invalid event date", "event");
      return res.status(400).json({ message: "Invalid event date" });
    }

    // Validate time (HH:mm:ss)
    let validEventTime = null;
    if (eventTime) {
      if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(eventTime)) {
        await logApiCall(req, res, 400, "Created event - invalid event time", "event");
        return res.status(400).json({ message: "Invalid event time. Format should be HH:mm or HH:mm:ss" });
      }
      validEventTime = eventTime.length === 5 ? `${eventTime}:00` : eventTime;
    }

    //validate max participants
    if (isNaN(maxParticipants) || parseInt(maxParticipants) <= 0) {
      await logApiCall(req, res, 400, "Created event - invalid max participants", "event");
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
      await logApiCall(req, res, 400, "Created event - event already exists for property and date", "event");
      return res.status(400).json({ message: "Event already exists for this property and date." });
    }

    if (!propertyId || propertyId === "all") {
      await logApiCall(req, res, 400, "Created event - property must be selected", "event");
      return res.status(400).json({ message: "Property must be selected for this event." });
    }

    //image path
    let eventImagePath = null;
    if (req.file) {
      eventImagePath = `/uploads/eventImages/${req.file.filename}`;;
    }

    const newEvent = await Events.create({
      title,
      eventDate: eventDateObj,
      eventTime: validEventTime,
      location,
      maxParticipants,
      description,
      propertyId,
      eventImage: eventImagePath
    });
    await logApiCall(req, res, 201, `Created new event: ${title} (ID: ${newEvent.id})`, "event", newEvent.id);

    //send notification
    await notifyEventUsers(newEvent, 'created');

    return res.status(201).json(newEvent);
  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while creating event", "event");
    return res.status(500).json({ message: "Internal server error", error: err.message });
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
    if (!event) {
      await logApiCall(req, res, 404, `Updated event - event not found (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(404).json({ message: "Event not found" });
    }

    //validate date of event const eventDateObj = eventDate ? new Date(eventDate) : event.eventDate;
    const eventDateObj = eventDate ? new Date(eventDate) : event.eventDate;
    if (eventDate && isNaN(eventDateObj.getTime())) {
      await logApiCall(req, res, 400, `Updated event - invalid event date (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(400).json({ message: "Invalid event date" });
    }

    // Validate time
    let validEventTime = event.eventTime;
    if (eventTime !== undefined) {
      if (!eventTime) {
        validEventTime = null; // allow clearing
      } else if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(eventTime)) {
        await logApiCall(req, res, 400, `Updated event - invalid event time (ID: ${eventId})`, "event", parseInt(eventId));
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
    if (!isEditing && eventDateOnly < today) {
      await logApiCall(req, res, 400, `Updated event - event date cannot be in past (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(400).json({ message: "Event date cannot be in the past." });
    }

    //validate max participants
    if (maxParticipants && (isNaN(maxParticipants) || parseInt(maxParticipants) <= 0)) {
      await logApiCall(req, res, 400, `Updated event - invalid max participants (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(400).json({ message: "Max participants must be a positive number." });
    }

    const duplicateEvent = await Events.findOne({
      where: {
        title: title ?? event.title,
        eventDate: eventDate ? eventDateObj : event.eventDate,
        id: { [Op.ne]: eventId }
      }
    });

    if (duplicateEvent) {
      await logApiCall(req, res, 400, `Updated event - duplicate event exists (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(400).json({ message: "Event already exists for this property and date." });
    }

    //image upload 
    if (req.file) {
      //  delete old image from disk if exists
      if (event.eventImage) {
        const oldPath = path.join(__dirname, '..', event.eventImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      event.eventImage = `/uploads/eventImages/${req.file.filename}`;
    }

    await event.update({
      title: title ?? event.title,
      eventDate: eventDate ? eventDateObj : event.eventDate,
      eventTime: validEventTime,
      location: location ?? event.location,
      maxParticipants: maxParticipants ?? event.maxParticipants,
      description: description ?? event.description,
      eventImage: event.eventImage
    });

    await logApiCall(req, res, 200, `Updated event: ${event.title} (ID: ${eventId})`, "event", parseInt(eventId));
    //send notification
    await notifyEventUsers(event, 'updated');

    return res.status(200).json({ message: "Event updated successfully", event });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while updating event", "event", parseInt(req.params.eventId) || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
}

//delte event
exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Events.findByPk(eventId);
    if (!event) {
      await logApiCall(req, res, 404, `Deleted event - event not found (ID: ${eventId})`, "event", parseInt(eventId));
      return res.status(404).json({ message: "Event not found" });
    }

    // delete event image from disk if exists
    if (event.eventImage) {
      const imagePath = path.join(__dirname, '..', event.eventImage);
      try {
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      } catch (err) {
        console.error("Error deleting event image:", err);
      }
    }
    await event.destroy();
    await logApiCall(req, res, 200, `Deleted event: ${event.title} (ID: ${eventId})`, "event", parseInt(eventId));
    return res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while deleting event", "event", parseInt(req.params.eventId) || 0);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows: events, count } = await Events.findAndCountAll({
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
      ],
      order: [['createdAt', 'DESC']],
      limit, offset
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
        description: event.description || '',
        eventImage: event.eventImage || null
      };
    });

    const totalPages = Math.ceil(count / limit);

    await logApiCall(req, res, 200, "Viewed all events list", "event");
    res.json({events: formatted,totalRecords: count,totalPages,currentPage: page,limit});

  } catch (err) {
    await logApiCall(req, res, 500, "Error occurred while fetching all events", "event");
    res.status(500).json({ error: err.message });
  }
}

exports.toggleEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Events.findByPk(id);
    if (!event) {
      await logApiCall(req, res, 404, `Toggled event status - event not found (ID: ${id})`, "event", parseInt(id));
      return res.status(404).json({ message: "Event not found" });
    }

    // Toggle the is_active field
    event.is_active = !event.is_active;
    await event.save();

    await logApiCall(req, res, 200, `Toggled event status to ${event.is_active ? 'active' : 'inactive'} (ID: ${id})`, "event", parseInt(id));
    return res.json({ message: 'Event Status Is updated', event });
  } catch (err) {
    console.error(err);
    await logApiCall(req, res, 500, "Error occurred while toggling event status", "event", parseInt(req.params.id) || 0);
    return res.status(500).json({ message: "Internal server error" });
  }
};