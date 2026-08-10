function calculateBookingFinancials({ monthlyRent, duration, amc, paidAmount, securityDeposit}) {
  const normalizedMonthlyRent = Number(monthlyRent || 0);
  const normalizedDuration = Number(duration || 0);
  const normalizedPaidAmount = Number(paidAmount || 0);
  const normalizedAmc = Number(amc || 0);
  const normalizedSecurityDeposit = Number(securityDeposit || 0);
  
  const totalAmount = Math.round(normalizedMonthlyRent * normalizedDuration + normalizedSecurityDeposit + normalizedAmc);
  const remainingAmount = Math.max(totalAmount - normalizedPaidAmount, 0);

  const completed = remainingAmount === 0

  return {
    totalAmount,
    remainingAmount,
    paymentStatus: completed ? 'COMPLETED' : normalizedPaidAmount > 0 ? 'PARTIAL' : 'INITIATED',
    securityDepositPaid: securityDeposit > 0,
  };
}

function validateOfflinePaymentPayload({
  amount,
  securityDepositAmount = 0,
  advanceRentAmount = 0,
  mealSubscriptionAmount = 0,
  amcChargesAmount = 0,
}) {
  const errors = [];
  const parsedAmount = Number(amount);
  const parsedSecurityDeposit = Number(securityDepositAmount || 0);
  const parsedAdvanceRent = Number(advanceRentAmount || 0);
  const parsedMealSubscription = Number(mealSubscriptionAmount || 0);
  const parsedAmcCharges = Number(amcChargesAmount || 0);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errors.push('amount must be greater than 0');
    return errors;
  }

  const computedTotal = Math.round(
    parsedSecurityDeposit + parsedAdvanceRent + parsedMealSubscription + parsedAmcCharges
  );

  if (Math.round(parsedAmount) !== computedTotal) {
    errors.push('amount must equal Security Deposit + Advance Rent + Meal Subscription + AMC Charges');
  }

  return errors;
}

module.exports = {
  calculateBookingFinancials,
  validateOfflinePaymentPayload,
};
