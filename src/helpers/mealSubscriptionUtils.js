const moment = require("moment-timezone");
const { Op } = require("sequelize");

const MealSubscription = require("../models/mealSubscription");
const Property = require("../models/property");
const Booking = require("../models/bookRoom");

const TZ = "Asia/Kolkata";
const VALID_MEAL_PLANS = ["2_TIMES", "4_TIMES"];
const COUNTED_STATUSES = ["PAID", "PARTIALLY_REFUNDED"];

function monthKey(date) {
  return moment.tz(date, TZ).format("YYYY-MM");
}

// Calendar months from check-in month to checkout month (inclusive)
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
  if (mealPlan === "2_TIMES") return Number(property.mealSubscriptionAmountTwoTimes || 0);
  if (mealPlan === "4_TIMES") return Number(property.mealSubscriptionAmountFourTimes || 0);
  return 0;
}

async function getMealCoverage(bookingId, transaction = null) {
  const rows = await MealSubscription.findAll({
    where: { bookingId, status: { [Op.in]: COUNTED_STATUSES } },
    order: [["startMonth", "ASC"]],
    transaction,
  });

  const paidMonthToRow = new Map();
  for (const row of rows) {
    for (const m of row.billingMonths || []) paidMonthToRow.set(m, row);
  }
  return { rows, paidMonthToRow };
}

async function syncBookingMealPlan(bookingId, transaction = null) {
  const latest = await MealSubscription.findOne({
    where: { bookingId, status: { [Op.in]: COUNTED_STATUSES } },
    order: [
      ["endMonth", "DESC"],
      ["createdAt", "DESC"],
    ],
    transaction,
  });

  if (latest) {
    await Booking.update(
      { mealPlan: latest.mealPlan },
      { where: { id: bookingId }, transaction }
    );
  }
}

async function syncOfflineMealSubscription({
  booking,
  paymentTransaction,
  transaction = null,
}) {
  if (!booking) throw new Error("Booking is required");
  if (!paymentTransaction) throw new Error("paymentTransaction is required");
  if (booking.isRentIncludingMeals) return null;

  const lock = transaction ? transaction.LOCK.UPDATE : undefined;
  const isOnlineMeal = paymentTransaction.type === "MEAL_SUBSCRIPTION";
  const isSuccess = paymentTransaction.status === "SUCCESS";
  const meta = paymentTransaction.meta || {};

  const existing = await MealSubscription.findOne({
    where: { paymentTransactionId: paymentTransaction.id },
    transaction,
    lock,
  });

  if (existing) {
    if (isSuccess && existing.status === "PENDING") {
      existing.status = "PAID";
      existing.paidAt = new Date();
      await existing.save({ transaction });
      if (isOnlineMeal) await syncBookingMealPlan(booking.id, transaction);
    }
    return existing;
  }

  const mealPlan = isOnlineMeal ? meta.mealPlan : booking.mealPlan;
  if (!VALID_MEAL_PLANS.includes(mealPlan)) return null;

  const bookingMonths = getMealMonths(booking);

  let months;
  if (isOnlineMeal) {
    months = Array.isArray(meta.billingMonths) ? [...meta.billingMonths].sort() : [];
    if (!months.every((m) => bookingMonths.includes(m))) {
      throw new Error("Meal billing months are outside the booking period");
    }
  } else {
    const duration = Number(paymentTransaction.mealSubscriptionDurationMonths || 0);
    if (duration > bookingMonths.length) {
      throw new Error(
        `Meal subscription duration cannot exceed booking coverage of ${bookingMonths.length} month(s)`
      );
    }
    months = bookingMonths.slice(0, duration);
  }

  if (months.length === 0) return null;

  let monthlyRate;
  if (isOnlineMeal) {
    monthlyRate = Number(meta.monthlyRate);
  } else {
    const property = await Property.findByPk(booking.propertyId, { transaction });
    monthlyRate = getMealRate(property, mealPlan);
  }

  if (!monthlyRate || monthlyRate <= 0) {
    throw new Error("Meal subscription rate is not configured for this property");
  }

  const waivedFirstMonth =
    !isOnlineMeal && Boolean(paymentTransaction.waiveFirstMonthMeal);

  const billableMonths = Math.max(months.length - (waivedFirstMonth ? 1 : 0), 0);
  const expectedAmount = monthlyRate * billableMonths;
  const totalAmount = Number(paymentTransaction.mealSubscriptionAmount || 0);

  if (expectedAmount !== totalAmount) {
    throw new Error(
      `Meal subscription amount must be ${expectedAmount} for ${months.length} month(s)`
    );
  }

  const { paidMonthToRow } = await getMealCoverage(booking.id, transaction);
  const overlap = months.filter((m) => paidMonthToRow.has(m));
  if (overlap.length) {
    if (!isOnlineMeal) {
      throw new Error(`Meal months already paid: ${overlap.join(", ")}`);
    }
    console.warn("[MEAL] online payment overlaps already-paid months", {
      txId: paymentTransaction.id,
      bookingId: booking.id,
      overlap,
    });
  }

  const row = await MealSubscription.create(
    {
      bookingId: booking.id,
      paymentTransactionId: paymentTransaction.id,
      mealPlan,
      monthlyRate,
      billingMonths: months,
      startMonth: months[0],
      endMonth: months[months.length - 1],
      monthsCount: months.length,
      waivedFirstMonth,
      amount: expectedAmount,
      status: isSuccess ? "PAID" : "PENDING",
      paidAt: isSuccess ? new Date() : null,
    },
    { transaction }
  );

  if (isOnlineMeal && isSuccess) {
    await syncBookingMealPlan(booking.id, transaction);
  }

  return row;
}

async function applyRefundToMealSubscription({
  originalTransaction,
  refundAmountPaise,
  transaction = null,
}) {
  if (!originalTransaction || originalTransaction.type !== "MEAL_SUBSCRIPTION") return;

  const refundAmountRupees = Number(refundAmountPaise || 0) / 100;
  if (refundAmountRupees <= 0) return;

  const rows = await MealSubscription.findAll({
    where: {
      paymentTransactionId: originalTransaction.id,
      status: { [Op.in]: COUNTED_STATUSES },
    },
    order: [["startMonth", "DESC"]],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  let remaining = refundAmountRupees;

  for (const row of rows) {
    if (remaining <= 0) break;

    const alreadyRefunded = Number(row.refundedAmount || 0);
    const refundable = Number(row.amount || 0) - alreadyRefunded;
    if (refundable <= 0) continue;

    const refundForRow = Math.min(refundable, remaining);
    row.refundedAmount = alreadyRefunded + refundForRow;
    row.status =
      row.refundedAmount >= Number(row.amount || 0) ? "REFUNDED" : "PARTIALLY_REFUNDED";

    await row.save({ transaction });
    remaining -= refundForRow;
  }
}

async function cancelInvalidPendingMealRows(booking, transaction = null) {
  const validMonths = new Set(getMealMonths(booking));

  const rows = await MealSubscription.findAll({
    where: { bookingId: booking.id, status: "PENDING" },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  for (const row of rows) {
    if ((row.billingMonths || []).some((m) => !validMonths.has(m))) {
      row.status = "CANCELLED";
      await row.save({ transaction });
    }
  }
}

module.exports = {
  monthKey,
  getMealMonths,
  getPayableMealMonths,
  getMealRate,
  getMealCoverage,
  syncBookingMealPlan,
  syncOfflineMealSubscription,
  applyRefundToMealSubscription,
  cancelInvalidPendingMealRows,
  VALID_MEAL_PLANS,
  COUNTED_STATUSES,
};