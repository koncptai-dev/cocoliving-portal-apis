const cron = require("node-cron");
const { notifyRentDue } = require("../notificationService");
const Booking = require("../../models/bookRoom");
const { Op } = require("sequelize");

const schedule = process.env.CRON_RENT_DUE || "0 8 7 * *";
cron.schedule(schedule, async () => {
  console.log("\n🕒 Running Rent Due Cron...");

  try {
    const today = new Date();
    console.log("📅 Today:", today);

    const bookings = await Booking.findAll({
      where: {
        monthlyPlanSelected: true,
        status: "approved",
        checkInDate: { [Op.lte]: today },
        checkOutDate: { [Op.gte]: today }
      }
    });

    console.log("📦 Bookings found:", bookings.length);

    for (const booking of bookings) {
      console.log("➡️ Processing booking:", booking.id);
      await notifyRentDue(booking);
    }

  } catch (err) {
    console.error("🔥 Rent cron error:", err.message);
  }
},{
  timezone: "Asia/Kolkata"
});