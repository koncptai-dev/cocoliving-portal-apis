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
  if (!visit) return;

  let user = null;

  // 1. Try phone match (priority)
  if (visit.phone) {
    user = await User.findOne({
      where: {
        phone: visit.phone
      }
    });
  }

  // 2. If not found → try email
  if (!user && visit.email) {
    user = await User.findOne({
      where: {
        email: {
          [Op.iLike]: visit.email
        }
      }
    });
  }

  // 3. If still not found → exit
  if (!user) return;

  const firstName = user.fullName?.split(" ")[0] || "User";
  const propertyName = visit.propertyName || "your property";
  await sendPushNotification(
    user.id,
    "Visit Reminder",
    `Hi ${firstName}, you have a scheduled visit today at ${propertyName}.`,
    { type: "visit_today", visitId: visit.id.toString() },
    "pushNotifications"
  );
};

exports.notifyCheckInReminder = async (booking) => {
  const { user, propertyName } = await getUserAndProperty(booking);
  if (!user) return;

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
  if (!booking.monthlyPlanSelected) return;

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
  const user = await User.findByPk(booking.userId);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Rent Due",
    `Today is the last day to pay rent. Please pay to avoid late fees.`,
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
  const user = await User.findByPk(booking.userId);
  if (!user) return;

  await sendPushNotification(
    user.id,
    "Tenure Ending",
    `Re-book your room before current tenure ends to continue living the CoCo way!`,
    { type: "tenure_ending", bookingId: booking.id.toString() },
    "pushNotifications"
  );
};