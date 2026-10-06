const moment = require("moment-timezone");
const { Op } = require("sequelize");

const MealSubscription = require("../models/mealSubscription");
const PaymentTransaction = require("../models/paymentTransaction");
const Property = require("../models/property");

const TZ = "Asia/Kolkata";

function monthKey(date) {
  return moment.tz(date, TZ).format("YYYY-MM");
}

function getMealMonths(booking) {
  const start = moment.tz(booking.checkInDate, TZ).startOf("month");
  const end = moment.tz(booking.checkOutDate, TZ).startOf("month");

  const months = [];

  while (start.isSameOrBefore(end, "month")) {
    months.push(start.format("YYYY-MM"));
    start.add(1, "month");
  }

  return months;
}

function getPayableMealMonths(booking, now = moment.tz(TZ)) {
  const bookingMonths = getMealMonths(booking);

  const currentMonth = moment.tz(now, TZ).startOf("month");

  return bookingMonths.filter((month) => {
    const monthDate = moment.tz(`${month}-01`, "YYYY-MM-DD", TZ);
    return monthDate.isSameOrAfter(currentMonth, "month");
  });
}

function getMealRate(property, mealPlan) {
  if (!property) return 0;

  if (mealPlan === "2_TIMES") {
    return Number(property.mealSubscriptionAmountTwoTimes || 0);
  }

  if (mealPlan === "4_TIMES") {
    return Number(property.mealSubscriptionAmountFourTimes || 0);
  }

  return 0;
}

async function getMealSubscriptionCoverage(
  bookingId,
  transaction = null
) {
  return MealSubscription.findAll({
    where: { bookingId },
    order: [["billingMonth", "ASC"]],
    transaction,
  });
}

async function syncOfflineMealSubscription({
  booking,
  paymentTransaction,
  transaction = null,
}) {
  if (!booking) {
    throw new Error("Booking is required");
  }

  if (
    booking.isRentIncludingMeals ||
    !booking.mealPlan ||
    booking.mealPlan === "NONE"
  ) {
    return [];
  }

  const durationMonths = Number(
    paymentTransaction?.mealSubscriptionDurationMonths || 0
  );

  const totalAmount = Number(
    paymentTransaction?.mealSubscriptionAmount || 0
  );

  if (durationMonths <= 0 || totalAmount <= 0) {
    return [];
  }

  const property = await Property.findByPk(booking.propertyId, {
    transaction,
  });

  const monthlyRate = getMealRate(
    property,
    booking.mealPlan
  );

  if (monthlyRate <= 0) {
    throw new Error(
      "Meal subscription rate is not configured for this property"
    );
  }

  const bookingMonths = getMealMonths(booking);

  if (durationMonths > bookingMonths.length) {
    throw new Error(
      `Meal subscription duration cannot exceed booking coverage of ${bookingMonths.length} month(s)`
    );
  }

  const waiveFirstMonth = Boolean(
    paymentTransaction.waiveFirstMonthMeal
  );

  const billableMonths = Math.max(
    durationMonths - (waiveFirstMonth ? 1 : 0),
    0
  );

  const expectedAmount = monthlyRate * billableMonths;

  if (expectedAmount !== totalAmount) {
    throw new Error(
      `Meal subscription amount must be ${expectedAmount} for ${durationMonths} month(s)`
    );
  }

  const monthsToCreate = bookingMonths.slice(
    0,
    durationMonths
  );

  const rows = [];

  for (let index = 0; index < monthsToCreate.length; index++) {
    const billingMonth = monthsToCreate[index];

    // First month is waived. No payment row is required for it.
    if (waiveFirstMonth && index === 0) {
      continue;
    }

    const existing = await MealSubscription.findOne({
      where: {
        bookingId: booking.id,
        billingMonth,
      },
      transaction,
      lock: transaction
        ? transaction.LOCK.UPDATE
        : undefined,
    });

    if (existing) {
      if (
        paymentTransaction.status === "SUCCESS" &&
        existing.status === "PENDING"
      ) {
        existing.status = "PAID";
        existing.paymentTransactionId =
          paymentTransaction.id;
        existing.paidAt = new Date();
        await existing.save({ transaction });
      }

      rows.push(existing);
      continue;
    }

    const row = await MealSubscription.create(
      {
        bookingId: booking.id,
        paymentTransactionId: paymentTransaction.id,
        billingMonth,
        amount: monthlyRate,
        status:
          paymentTransaction.status === "SUCCESS"
            ? "PAID"
            : "PENDING",
        paidAt:
          paymentTransaction.status === "SUCCESS"
            ? new Date()
            : null,
      },
      { transaction }
    );

    rows.push(row);
  }

  return rows;
}

async function applyRefundToMealSubscription({
  originalTransaction,
  refundAmountPaise,
  transaction = null,
}) {
  if (
    !originalTransaction ||
    originalTransaction.type !== "MEAL_SUBSCRIPTION"
  ) {
    return;
  }

  const refundAmountRupees =
    Number(refundAmountPaise || 0) / 100;

  if (refundAmountRupees <= 0) return;

  const rows = await MealSubscription.findAll({
    where: {
      paymentTransactionId: originalTransaction.id,
      status: {
        [Op.in]: ["PAID", "PARTIALLY_REFUNDED"],
      },
    },
    order: [["billingMonth", "DESC"]],
    transaction,
    lock: transaction
      ? transaction.LOCK.UPDATE
      : undefined,
  });

  let remainingRefund = refundAmountRupees;

  for (const row of rows) {
    if (remainingRefund <= 0) break;

    const alreadyRefunded = Number(
      row.refundedAmount || 0
    );

    const refundable =
      Number(row.amount || 0) - alreadyRefunded;

    if (refundable <= 0) continue;

    const refundForRow = Math.min(
      refundable,
      remainingRefund
    );

    row.refundedAmount =
      alreadyRefunded + refundForRow;

    if (
      row.refundedAmount >=
      Number(row.amount || 0)
    ) {
      row.status = "PARTIALLY_REFUNDED";
    } else {
      row.status = "PARTIALLY_REFUNDED";
    }

    await row.save({ transaction });

    remainingRefund -= refundForRow;
  }
}

module.exports = {
  monthKey,
  getMealMonths,
  getPayableMealMonths,
  getMealRate,
  getMealSubscriptionCoverage,
  syncOfflineMealSubscription,
  applyRefundToMealSubscription,
};