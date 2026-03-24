const cron = require("node-cron");
const Booking = require("../../models/bookRoom");
const { notifyCheckInReminder } = require("../notificationService");

cron.schedule("*/15 * * * *", async () => {
  console.log("\n🕒 Running Check-in Cron...");

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateStr = tomorrow.toLocaleDateString("en-CA");
    console.log("📅 Target Date:", dateStr);

    const bookings = await Booking.findAll({
      where: {
        checkInDate: dateStr,
        status: "approved"
      }
    });

    console.log("📦 Bookings found:", bookings.length);

    for (const booking of bookings) {
      console.log("➡️ Processing booking:", booking.id);
      await notifyCheckInReminder(booking);
    }

  } catch (err) {
    console.error("🔥 Check-in cron error:", err.message);
  }
});