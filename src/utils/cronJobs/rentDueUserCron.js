const cron = require("node-cron");
const { notifyRentDue } = require("../notificationService");
const Booking = require("../../models/bookRoom");
const { Op } = require("sequelize");

cron.schedule("0 9 7 * *", async () => {
  try {
    const today = new Date();
    const bookings = await Booking.findAll({
      where: {
        monthlyPlanSelected: true,
        status: "approved",
        checkInDate: { [Op.lte]: today },
        checkOutDate: { [Op.gte]: today }
      }
    });

    for (const booking of bookings) {
      try {
        await notifyRentDue(booking);
      } catch (err) {
        console.error("Rent notification failed:", err.message);
      }
    }
  } catch (err) {
    console.error("Rent cron error:", err.message);
  }
});