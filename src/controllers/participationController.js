
const { Event, EventParticipation, User, Booking, Rooms,Property } = require("../models");
const {Op}=require('sequelize');

exports.joinEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    let { userId, status } = req.body; // status = attending | not_attending


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
    
    const user = await User.findByPk(userId, {
      include: [{ model: Booking,as:'bookings', include: [{ model: Rooms, as: "room", include: [{ model: Property, as: "property" }]  }] }]
    })
    
    if (!user) return res.status(404).json({ message: "User not found" });

    // Get user's property IDs from bookings
    const propertyIds = (user.bookings || []).map(b => b.room?.propertyId).filter(Boolean);

    const events = await Event.findAll({
      where: {
        is_active: true,
        [Op.or]: [
         { propertyId: null }, 
            propertyIds.length ? { propertyId: propertyIds } : {}
        ]
      },
      include: [
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ["id", "fullName"] }]
        }
      ]
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

    return res.status(200).json(formattedEvents);
  } catch (err) {
    console.error("getEvents error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

