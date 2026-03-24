const cron = require("node-cron");
const ScheduledVisit = require("../../models/scheduledVisit");
const { notifyVisitToday } = require("../notificationService");

cron.schedule("*/15 * * * *", async () => {
  console.log("\n🕒 Running Visit Cron...");

  try {
    const today = new Date().toLocaleDateString("en-CA");
    console.log("📅 Today:", today);

    const visits = await ScheduledVisit.findAll({
      where: {
        visitDate: today,
        status: "approved"
      }
    });

    console.log("📦 Visits found:", visits.length);

    for (const visit of visits) {
      console.log("➡️ Processing visit:", visit.id);
      await notifyVisitToday(visit);
    }

  } catch (err) {
    console.error("🔥 Visit cron error:", err.message);
  }
});