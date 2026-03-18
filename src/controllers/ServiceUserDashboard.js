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
    if (["cleaner", "housekeeping"].includes(roleType)) {

      const today = new Date().toISOString().split("T")[0];

      const todayCleanings = await DailyCleaning.findAll({
        where: { cleanerId: userId, cleaningDate: today },
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

      response.cleaning = todayCleanings;
    }

    const tickets = await SupportTicket.findAll({
      where: { assignedTo: userId },
      order: [["createdAt", "DESC"]],
    });

    response.tickets = tickets;

    return res.json(response);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dashboard failed" });
  }
};
