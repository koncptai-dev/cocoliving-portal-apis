const { sendPushNotification } = require("../helpers/notificationHelper");
const User = require("../models/user");
const { Op } = require("sequelize");

// utility to fetch user + property safely
async function getUserAndProperty(booking) {
  const user = await User.findByPk(booking.userId);
  const propertyName =
    booking?.room?.property?.name ||
    booking?.rateCard?.property?.name ||
    "your property";

  return { user, propertyName };
}

exports.notifyVisitToday = async (visit) => {
  console.log("\n==== notifyVisitToday ====");
  console.log("Visit:", visit?.id);

  if (!visit) return;

  let user = null;

  if (visit.phone) {
    console.log("Trying phone:", visit.phone);
    user = await User.findOne({ where: { phone: visit.phone } });
  }

  if (!user && visit.email) {
    console.log("Trying email:", visit.email);
    user = await User.findOne({
      where: { email: { [Op.iLike]: visit.email } }
    });
  }

  if (!user) {
    console.log("❌ No user found for visit:", visit.id);
    return;
  }

  console.log("✅ User found:", user.id);

  const firstName = user.fullName?.split(" ")[0] || "User";
  const propertyName = visit.propertyName || "your property";

  await sendPushNotification(
    user.id,
    "Visit Reminder",
    `Hi ${firstName}, you have a scheduled visit today at ${propertyName}. [VisitID:${visit.id}]`,
    { type: "visit_today", visitId: visit.id.toString() },
    "pushNotifications"
  );
};

exports.notifyCheckInReminder = async (booking) => {
  console.log("\n==== notifyCheckInReminder ====");
  console.log("Booking:", booking?.id);

  const { user, propertyName } = await getUserAndProperty(booking);

  if (!user) {
    console.log("❌ User not found for booking:", booking?.id);
    return;
  }

  console.log("✅ User found:", user.id);

  await sendPushNotification(
    user.id,
    "Check-in Reminder",
    `We are ready to welcome you to ${propertyName} on ${booking.checkInDate}. Please make sure to have any pending documents ready with you.`,
    { type: "checkin_reminder", bookingId: booking.id.toString() },
    "pushNotifications"
  );
};

exports.notifyOnboardingSuccess = async (booking) => {
  const { user, propertyName } = await getUserAndProperty(booking);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Welcome",
    `Welcome to ${propertyName}. Please make sure to explore all the features of our app.`,
    { type: "onboarding_success" },
    "pushNotifications"
  );
};

exports.notifySecurityDeposit = async (booking) => {

  const { user } = await getUserAndProperty(booking);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Security Deposit",
    `Please pay the security deposit before check-in date to ensure smooth onboarding process.`,
    { type: "security_deposit", bookingId: booking.id.toString() },
    "pushNotifications"
  );
};

exports.notifyRentDue = async (booking) => {
  console.log("\n==== notifyRentDue ====");
  console.log("Booking:", booking?.id);

  const user = await User.findByPk(booking.userId);

  if (!user) {
    console.log("❌ User not found for booking:", booking?.id);
    return;
  }

  console.log("✅ User found:", user.id);

  const now = new Date();
  const formatted = now.toLocaleString("en-IN", { month: "short", year: "numeric" });

  await sendPushNotification(
    user.id,
    "Rent Due",
    `Today is the last day to pay rent. Please pay to avoid late fees. [${formatted}]`,
    { type: "rent_due_last_day", bookingId: booking.id.toString() },
    "pushNotifications"
  );
};


exports.notifyRequestUpdate = async (request) => {
  if (!request?.userId) return;

  const user = await User.findByPk(request.userId);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Request Update",
    `Your request #${request.id} status has been updated to ${request.status.replace("-", " ")}`,
    { type: "request_update", requestId: request.id.toString() },
    "pushNotifications"
  );
};

exports.notifyGuestRequest = async (guestRequest) => {
  const userId = guestRequest.residentUserId || guestRequest.createdByUserId;
  if (!userId) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Guest Request",
    `Your Guest Pass request has been registered.`,
    { type: "guest_update", guestId: guestRequest.id.toString() },
    "pushNotifications"
  );
};

exports.notifyTenureEnding = async (booking) => {
  console.log("\n==== notifyTenureEnding ====");
  console.log("Booking:", booking?.id);

  const user = await User.findByPk(booking.userId);

  if (!user) {
    console.log("❌ User not found for booking:", booking?.id);
    return;
  }

  console.log("✅ User found:", user.id);

  await sendPushNotification(
    user.id,
    "Tenure Ending",
    `Re-book your room before current tenure ends to continue living the CoCo way! [Booking:${booking.id}]`,
    { type: "tenure_ending", bookingId: booking.id.toString() },
    "pushNotifications"
  );
};