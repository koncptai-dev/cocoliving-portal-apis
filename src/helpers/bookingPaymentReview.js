const moment = require("moment");
const UserKYC = require("../models/userKYC");

function toRupees(value) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function isValidRupeeAmount(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizeSecurityDepositType(type) {
  const normalized = String(type || "").trim().toUpperCase();

  if (["1+1", "ONE_PLUS_ONE"].includes(normalized)) return "1+1";
  if (["1+2", "ONE_PLUS_TWO"].includes(normalized)) return "1+2";
  if (normalized === "DYNAMIC") return "DYNAMIC";

  return null;
}

function getSecurityDepositAmount(type, monthlyRent, enteredAmount) {
  if (type === "1+1") return Math.round(Number(monthlyRent || 0));
  if (type === "1+2") return Math.round(Number(monthlyRent || 0) * 2);
  return Math.round(Number(enteredAmount || 0));
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (["true", "yes", "1"].includes(String(value).toLowerCase())) return true;
  if (["false", "no", "0"].includes(String(value).toLowerCase())) return false;
  return null;
}

function normalizeMealPlan(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (["NONE", "NO", "NO_MEAL", "WITHOUT_MEAL", "0"].includes(normalized)) return "NONE";
  if (["2", "2_TIME", "2_TIMES", "TWO_TIME", "TWO_TIMES"].includes(normalized)) return "2_TIMES";
  if (["4", "4_TIME", "4_TIMES", "FOUR_TIME", "FOUR_TIMES"].includes(normalized)) return "4_TIMES";

  return null;
}

function calculateWaiveOffForRemainingDays(checkInDate, monthlyRent, waiveEnabled) {
  if (!waiveEnabled) {
    return { applied: false, remainingDays: 0, daysInMonth: 0, amount: 0 };
  }

  const parsedCheckIn = moment(checkInDate, "YYYY-MM-DD", true);
  if (!parsedCheckIn.isValid()) {
    return { applied: true, remainingDays: 0, daysInMonth: 0, amount: 0 };
  }

  const daysInMonth = parsedCheckIn.daysInMonth();
  const remainingDays = daysInMonth - parsedCheckIn.date() + 1;
  const rentPerDay = Number(monthlyRent || 0) / daysInMonth;
  const waivedAmount = Math.round(rentPerDay * remainingDays);

  return { applied: true, remainingDays, daysInMonth, amount: waivedAmount };
}

function calculateAdvanceRent(checkInDate, monthlyRent, advanceMonths) {
  if (!advanceMonths || advanceMonths <= 0) return 0;

  const parsedCheckIn = moment(checkInDate, "YYYY-MM-DD", true);
  if (!parsedCheckIn.isValid()) return 0;

  const rent = Number(monthlyRent || 0);
  const daysInCheckInMonth = parsedCheckIn.daysInMonth();
  const checkInDay = parsedCheckIn.date();
  const remainingDays = daysInCheckInMonth - checkInDay + 1;
  const dailyRent = rent / daysInCheckInMonth;
  const firstMonthRent = dailyRent * remainingDays;
  const fullMonths = advanceMonths - 1;

  return Math.round(firstMonthRent + (rent * fullMonths));
}

function formatBookingOption(booking) {
  const userName = booking.user?.fullName || `User ${booking.userId}`;
  const propertyName = booking.property?.name || "Property";
  const roomNumber = booking.room?.roomNumber ? `Room ${booking.room.roomNumber}` : booking.roomType;

  return {
    id: booking.id,
    label: `#${booking.id} - ${userName} - ${propertyName} - ${roomNumber}`,
    userId: booking.userId,
    userName,
    propertyId: booking.propertyId,
    propertyName,
    roomId: booking.roomId,
    roomNumber: booking.room?.roomNumber || null,
    roomType: booking.roomType,
    status: booking.status,
    bookingType: booking.bookingType,
    paymentStatus: booking.paymentStatus,
    totalAmount: Number(booking.totalAmount || 0),
    remainingAmount: Number(booking.remainingAmount || 0),
  };
}

async function buildBookingPaymentReview(payload, booking, transaction = null) {
  const {
    totalAmountReceived,
    totalAmountReceivedRent,
    waiveOff,
    rentAmount,
    currentMonthRent,
    waiveCurrentMonthRent = false,
    securityDepositType,
    securityDepositAmount,
    securityDeposit,
    advanceRent,
    advanceRentAmount,
    advanceRentDurationMonths,
    advanceRentDuration,
    durationOfAdvanceRentMonths,
    mealSubscription,
    mealSubscriptionAmount,
    mealAmount,
    mealSubscriptionDurationMonths,
    durationOfMealSubscriptionMonths,
    amcCharges,
    amcChargeAmount,
    panCardNumber,
    panNumber
  } = payload;

  const depositType = normalizeSecurityDepositType(securityDepositType);
  const errors = [];
  const waiveOffRequested = normalizeBoolean(waiveOff ?? waiveCurrentMonthRent);

  if (waiveOffRequested === null) {
    errors.push("waiveOff must be true or false");
  }

  const baseMonthlyRent = Math.round(Number(
    booking.baseMonthlyRent ??
    booking.monthlyRent ??
    booking.totalMonthlyAmount ??
    0
  ));
  const waiveOffDetails = calculateWaiveOffForRemainingDays(
    booking.checkInDate,
    baseMonthlyRent,
    Boolean(waiveOffRequested)
  );

  if (!depositType) {
    errors.push("securityDepositType must be 1+1, 1+2 or DYNAMIC");
  }

  const received = toRupees(totalAmountReceived ?? totalAmountReceivedRent);
  const manualRent = toRupees(rentAmount ?? currentMonthRent ?? baseMonthlyRent);
  const rent = Boolean(waiveOffRequested)
    ? Math.max(0, Math.round(baseMonthlyRent - waiveOffDetails.amount))
    : manualRent;
  const securityInput = securityDepositAmount ?? securityDeposit;
  const normalizedSecurityInput =
    securityInput === undefined || securityInput === null || securityInput === ""
      ? null
      : Math.round(Number(securityInput));
  const expectedSecurityBaseRent = Number(
    booking.baseMonthlyRent ??
    booking.monthlyRent ??
    booking.totalMonthlyAmount ??
    0
  );
  const expectedFixedSecurity = depositType && depositType !== "DYNAMIC"
    ? getSecurityDepositAmount(depositType, expectedSecurityBaseRent, securityInput)
    : null;
  const security = depositType
    ? getSecurityDepositAmount(depositType, expectedSecurityBaseRent, securityInput)
    : toRupees(securityInput);
  const advance = toRupees(advanceRent ?? advanceRentAmount);
  const meal = toRupees(mealSubscriptionAmount ?? mealSubscription ?? mealAmount);
  const parsedAdvanceRentDurationMonths =
    advanceRentDurationMonths ?? advanceRentDuration ?? durationOfAdvanceRentMonths;
  const parsedMealSubscriptionDurationMonths =
    mealSubscriptionDurationMonths ?? durationOfMealSubscriptionMonths;
  const advanceMonths =
    parsedAdvanceRentDurationMonths === undefined || parsedAdvanceRentDurationMonths === null || parsedAdvanceRentDurationMonths === ""
      ? null
      : Number(parsedAdvanceRentDurationMonths);
  const mealMonths =
    parsedMealSubscriptionDurationMonths === undefined || parsedMealSubscriptionDurationMonths === null || parsedMealSubscriptionDurationMonths === ""
      ? null
      : Number(parsedMealSubscriptionDurationMonths);
  const amc = toRupees(amcCharges ?? amcChargeAmount);

  if (!isValidRupeeAmount(received) || received <= 0) {
    errors.push("totalAmountReceived must be greater than 0");
  }

  if (!isValidRupeeAmount(rent)) {
    errors.push("rentAmount must be a valid amount");
  }

  if (!isValidRupeeAmount(security)) {
    errors.push("securityDepositAmount must be a valid amount");
  }

  if (
    expectedFixedSecurity !== null &&
    normalizedSecurityInput !== null &&
    normalizedSecurityInput !== expectedFixedSecurity
  ) {
    errors.push(`securityDepositAmount must be ${expectedFixedSecurity} for ${depositType} security deposit`);
  }

  if (depositType === "DYNAMIC" && security <= 0) {
    errors.push("securityDepositAmount is required for Dynamic security deposit");
  }

  if (!isValidRupeeAmount(advance)) {
    errors.push("advanceRent must be a valid amount");
  }

  if (!isValidRupeeAmount(meal)) {
    errors.push("mealSubscriptionAmount must be a valid amount");
  }

  if (advanceMonths !== null && (!Number.isInteger(advanceMonths) || advanceMonths < 0)) {
    errors.push("advanceRentDurationMonths must be a valid non-negative integer");
  }

  if (mealMonths !== null && (!Number.isInteger(mealMonths) || mealMonths < 0)) {
    errors.push("mealSubscriptionDurationMonths must be a valid non-negative integer");
  }

  const bookingDurationMonths = Number(booking.duration || 0);
  if (advanceMonths !== null && advanceMonths > bookingDurationMonths) {
    errors.push("advanceRentDurationMonths cannot exceed booking duration");
  }

  if (mealMonths !== null && mealMonths > bookingDurationMonths) {
    errors.push("mealSubscriptionDurationMonths cannot exceed booking duration");
  }

  const expectedAdvanceRentAmount =
    advanceMonths === null
      ? null
      : calculateAdvanceRent(booking.checkInDate, baseMonthlyRent, advanceMonths);

  if (advanceMonths === null && Math.round(advance) > 0) {
    errors.push("advanceRentDurationMonths is required when advanceRent is greater than 0");
  }

  if (expectedAdvanceRentAmount !== null && Math.round(advance) !== expectedAdvanceRentAmount) {
    errors.push(`advanceRent must be ${expectedAdvanceRentAmount} for ${advanceMonths} month(s) duration`);
  }

  const normalizedBookingMealPlan = normalizeMealPlan(booking.mealPlan || "NONE") || "NONE";
  const propertyMealTwoTimes = Number(booking.property?.mealSubscriptionAmountTwoTimes || 0);
  const propertyMealFourTimes = Number(booking.property?.mealSubscriptionAmountFourTimes || 0);
  const configuredMealPerMonth = normalizedBookingMealPlan === "2_TIMES"
    ? Math.round(propertyMealTwoTimes)
    : normalizedBookingMealPlan === "4_TIMES"
      ? Math.round(propertyMealFourTimes)
      : 0;

  if ((normalizedBookingMealPlan === "NONE" || Boolean(booking.isRentIncludingMeals)) && (Math.round(meal) > 0 || (mealMonths !== null && mealMonths > 0))) {
    errors.push("mealSubscriptionAmount must be 0 when meal plan is NONE or rent includes meals");
  }

  if (normalizedBookingMealPlan !== "NONE" && !Boolean(booking.isRentIncludingMeals)) {
    if (mealMonths === null && Math.round(meal) > 0) {
      errors.push("mealSubscriptionDurationMonths is required when mealSubscriptionAmount is greater than 0");
    }

    if (mealMonths !== null) {
      const expectedMealSubscriptionAmount = Math.round(configuredMealPerMonth * mealMonths);
      if (Math.round(meal) !== expectedMealSubscriptionAmount) {
        errors.push(
          `mealSubscriptionAmount must be ${expectedMealSubscriptionAmount} for ${mealMonths} month(s) with ${normalizedBookingMealPlan}`
        );
      }
    }
  }

  if (!isValidRupeeAmount(amc)) {
    errors.push("amcCharges must be a valid amount");
  }

  const computedTotal = Math.round(security + advance + meal + amc);

  if (Math.round(received) !== computedTotal) {
    errors.push("Total Amount Received must equal Security Deposit + Advance Rent + Meal Subscription + AMC Charges");
  }

  const kyc = await UserKYC.findOne({
    where: { userId: booking.userId },
    attributes: ["panNumber", "panStatus"],
    transaction
  });

  const existingPan = kyc?.panNumber || null;
  const finalPanNumber = panCardNumber || panNumber || existingPan;

  if (finalPanNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(finalPanNumber).toUpperCase())) {
    errors.push("PAN card number must be valid");
  }

  return {
    errors,
    review: {
      booking: formatBookingOption(booking),
      inputs: {
        totalAmountReceived: Math.round(received),
        rentAmount: Math.round(rent),
        waiveCurrentMonthRent: Boolean(waiveOffRequested),
        securityDepositType: depositType,
        securityDepositAmount: Math.round(security),
        advanceRent: Math.round(advance),
        advanceRentDurationMonths: advanceMonths,
        mealSubscriptionAmount: Math.round(meal),
        mealSubscriptionDurationMonths: mealMonths,
        amcCharges: Math.round(amc),
        panCardNumber: finalPanNumber || null
      },
      calculated: {
        rentAmount: Math.round(rent),
        securityDepositAmount: Math.round(security),
        advanceRent: Math.round(advance),
        advanceRentDurationMonths: advanceMonths,
        mealSubscriptionAmount: Math.round(meal),
        mealSubscriptionDurationMonths: mealMonths,
        amcCharges: Math.round(amc),
        waiveOff: waiveOffDetails,
        totalAmountReceived: Math.round(received),
        expectedTotal: computedTotal,
        difference: Math.round(received) - computedTotal,
        panRequired: false,
        gstApplicableOnInvoice: received > 20000,
        invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL"
      }
    }
  };
}

module.exports = {
  buildBookingPaymentReview,
  formatBookingOption,
  normalizeSecurityDepositType,
  getSecurityDepositAmount,
  normalizeBoolean,
  normalizeMealPlan,
  calculateWaiveOffForRemainingDays,
  calculateAdvanceRent,
  toRupees,
  isValidRupeeAmount,
};