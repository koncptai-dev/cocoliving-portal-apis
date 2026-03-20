const cron = require("node-cron");
const ScheduledVisit = require("../../models/scheduledVisit");
const { notifyVisitToday } = require("../notificationService");

cron.schedule("0 9 * * *", async () => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const visits = await ScheduledVisit.findAll({
      where: {
        visitDate: today,
        status: "approved"
      }
    });

    for (const visit of visits) {
      try {
        await notifyVisitToday(visit);
      } catch (err) {
        console.error("Visit notification failed:", err.message);
      }
    }
  } catch (err) {
    console.error("Visit cron error:", err.message);
  }
});