const { ServiceTeam, ServiceTeamRoom, SupportTicket, Rooms, Property, DailyCleaning } = require("../models");
const { Op } = require("sequelize");

exports.getServiceDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const serviceTeam = await ServiceTeam.findOne({
      where: { userId }
    });

    if(!serviceTeam ){
      return res.status(403).json({ message: "Service team not found" });
    }
    const roleType = serviceTeam?.serviceRoleType?.toLowerCase();

    let response = {
      roleType,
      cleaning: [],
      tickets: []
    };
    if (roleType === "housekeeping") {

      const assignedRooms = await ServiceTeamRoom.findAll({
        where: {
          serviceTeamId: serviceTeam.id,
          isActive: true
        },
        include: [
          {
            model: Rooms,
            as: "teamroom",
            include: [{
              model: Property,
              as: "property",
              attributes: ["name"]
            }]
          }
        ]
      });

      const today = new Date().toISOString().split("T")[0];

      const todayCleanings = await DailyCleaning.findAll({
        where: { cleanerId: userId, cleaningDate: today },
        attributes: ["roomId", "status", "photos"],
        include: [
          {
            model: Rooms,
            as: "room",
            include: [{
              model: Property,
              as: "property",
              attributes: ["id", "name"]
            }]
          }
        ]
      });

      const cleaningMap = new Map();

      todayCleanings.forEach(c => {
        cleaningMap.set(c.roomId, {
          status: c.status,
          photos: c.photos || []
        });
      });

      const formatted = assignedRooms.map(r => {
        const cleaningData = cleaningMap.get(r.roomId);

        return {
          id: r.teamroom.id,
          roomNumber: r.teamroom.roomNumber,
          propertyName: r.teamroom.property?.name,
          status: cleaningData?.status || "Pending",
          photos: cleaningData?.photos || []
        };
      });

      response.cleaning = formatted;
    }

    const tickets = await SupportTicket.findAll({
      where: { assignedTo: userId },
      include: [
        {
          model: Rooms,
          as: "room",
          attributes: ["roomNumber"],
          include: [
            {
              model: Property,
              as: "property",
              attributes: ["name"]
            }
          ]
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    response.tickets = tickets;

    return res.json(response);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dashboard failed" });
  }
};
