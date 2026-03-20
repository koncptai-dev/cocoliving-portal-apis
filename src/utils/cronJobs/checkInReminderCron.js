const cron = require("node-cron");
const Booking = require("../../models/bookRoom");
const { notifyCheckInReminder } = require("../notificationService");

cron.schedule("0 10 * * *", async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const bookings = await Booking.findAll({
      where: {
        checkInDate: dateStr,
        status:"approved"
      }
    });

    for (const booking of bookings) {
      try {
        await notifyCheckInReminder(booking);
      } catch (err) {
        console.error("Check-in notification failed:", err.message);
      }
    }
  } catch (err) {
    console.error("Check-in cron error:", err.message);
  }
});