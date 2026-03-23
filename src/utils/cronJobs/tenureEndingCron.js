const cron = require("node-cron");
const { notifyTenureEnding } = require("../notificationService");
const Booking = require("../../models/bookRoom");

cron.schedule("*/15 * * * *", async () => {
  try {
    const today = new Date();

    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 7);
    const dateStr = targetDate.toISOString().split("T")[0];

    const bookings = await Booking.findAll({
      where: {
        checkOutDate: dateStr,
        status : "approved"
      }
    });

    for (const booking of bookings) {
      try {
        await notifyTenureEnding(booking);
      } catch (err) {
        console.error("Tenure notification failed:", err.message);
      }
    }
  } catch (err) {
    console.error("Tenure cron error:", err.message);
  }
});