const cron = require("node-cron");
const { notifyTenureEnding } = require("../notificationService");
const Booking = require("../../models/bookRoom");

cron.schedule("*/15 * * * *", async () => {
  console.log("\n🕒 Running Tenure Ending Cron...");

  try {
    const today = new Date();

    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 7);

    const dateStr = targetDate.toLocaleDateString("en-CA");
    console.log("📅 Target Date:", dateStr);

    const bookings = await Booking.findAll({
      where: {
        checkOutDate: dateStr,
        status: "approved"
      }
    });

    console.log("📦 Bookings found:", bookings.length);

    for (const booking of bookings) {
      console.log("➡️ Processing booking:", booking.id);
      await notifyTenureEnding(booking);
    }

  } catch (err) {
    console.error("🔥 Tenure cron error:", err.message);
  }
});