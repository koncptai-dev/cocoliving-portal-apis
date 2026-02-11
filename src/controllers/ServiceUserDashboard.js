const { ServiceTeam, ServiceTeamRoom, Rooms, Property, DailyCleaning } = require("../models");
const { Op } = require("sequelize");

exports.getServiceDashboard = async (req, res) => {
  try {
    const cleanerId = req.user.id;

    const today = new Date().toISOString().split("T")[0];

    //  ONLY TODAY CLEANING RECORDS
    const todayCleanings = await DailyCleaning.findAll({
      where: {
        cleanerId,
        cleaningDate: today,
      },
      include: [
        {
          model: Rooms,
          as: "room",
          include: [
            {
              model: Property,
              as: "property",
              attributes: ["id", "name", "address"],
            },
          ],
        },
      ],
    });

    // no work today
    if (!todayCleanings.length) {
      return res.json({
        property: null,
        rooms: [],
      });
    }

    // property for all rooms
    const property = todayCleanings[0].room.property;

    const rooms = todayCleanings.map(cleaning => ({
      id: cleaning.room.id,
      roomNumber: cleaning.room.roomNumber,
      status: cleaning.status?.toLowerCase() === "completed"
        ? "completed"
        : "pending",
    }));

    return res.json({
      property,
      rooms,
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Dashboard load failed" });
  }
};
