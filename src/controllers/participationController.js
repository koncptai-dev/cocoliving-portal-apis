
const { Event, EventParticipation, User, Booking, Rooms, Property } = require("../models");
const { Op } = require('sequelize');

exports.joinEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    let { userId, status } = req.body; // status = attending | not_attending

    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if event date/time has passed
    const eventDateTime = new Date(`${event.eventDate}T${event.eventTime || "00:00:00"}`);
    if (eventDateTime < new Date()) {
      return res.status(400).json({ message: "Cannot join a completed event" });
    }

    //if user not sending status it set to attending
    if (!status) {
      status = "attending";
    }

    // upsert (insert if not exist, update if exists)
    const [participation, created] = await EventParticipation.findOrCreate({
      where: { eventId, userId },
      defaults: { status }
    });

    if (!created) {
      participation.status = status;
      await participation.save();
    }

    res.json({ message: "Participation updated", participation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// All Events

exports.getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const user = await User.findByPk(userId, {
      include: [{ model: Booking, as: 'bookings', include: [{ model: Rooms, as: "room", include: [{ model: Property, as: "property" }] }] }]
    })

    if (!user) return res.status(404).json({ message: "User not found" });

    // Get user's property IDs from bookings
    const propertyIds = (user.bookings || []).map(b => b.room?.propertyId).filter(Boolean);

    const { rows: events, count } = await Event.findAndCountAll({
      where: {
        is_active: true,
        [Op.or]: [
          { propertyId: null },
          propertyIds.length ? { propertyId: propertyIds } : {}
        ]
      },
      include: [
        {
          model: Property,
          as: "property",
          attributes: ["id", "name",]
        },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ["id", "fullName"] }]
        }
      ],
      limit,
      offset, order: [['createdAt', 'DESC']]
    });

    const formattedEvents = events.map((event) => {
      const attendingCount = event.EventParticipations.filter(
        (p) => p.status === "active" || p.status === "attending"
      ).length;

      return {
        ...event.toJSON(),
        attendingCount,
      };
    });
    const totalPages = Math.ceil(count / limit);

    res.status(200).json({ events: formattedEvents, currentPage: page, totalPages, totalEvents: count });
  } catch (err) {
    console.error("getEvents error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

