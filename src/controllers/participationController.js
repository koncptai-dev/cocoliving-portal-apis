
const { Event, EventParticipation, User } = require("../models");


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
    const events = await Event.findAll({
     
    });
    return res.status(200).json(events);
  } catch (err) {
    console.error("getEvents error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

