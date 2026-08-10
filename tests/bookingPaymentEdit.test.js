const { calculateBookingFinancials, validateOfflinePaymentPayload } = require('../src/helpers/bookingEditUtils');

describe('booking financial recalculation', () => {
  test('recalculates total, remaining amount and payment status from updated booking values', () => {
    const result = calculateBookingFinancials({
      monthlyRent: 10000,
      duration: 3,
      paidAmount: 25000,
    });

    expect(result.totalAmount).toBe(50000);
    expect(result.remainingAmount).toBe(25000);
    expect(result.paymentStatus).toBe('PARTIAL');
    expect(result.securityDepositPaid).toBe(false);
  });

  test('marks security deposit as paid when the paid amount covers the deposit amount', () => {
    const result = calculateBookingFinancials({
      monthlyRent: 10000,
      duration: 2,
      paidAmount: 40000,
    });

    expect(result.totalAmount).toBe(40000);
    expect(result.remainingAmount).toBe(0);
    expect(result.paymentStatus).toBe('COMPLETED');
    expect(result.securityDepositPaid).toBe(true);
  });

  test('accepts payment totals that match the breakdown', () => {
    const errors = validateOfflinePaymentPayload({
      amount: 50000,
      securityDepositAmount: 20000,
      advanceRentAmount: 20000,
      mealSubscriptionAmount: 5000,
      amcChargesAmount: 5000,
    });

    expect(errors).toEqual([]);
  });

  test('rejects payment totals that do not match the breakdown', () => {
    const errors = validateOfflinePaymentPayload({
      amount: 40000,
      securityDepositAmount: 20000,
      advanceRentAmount: 20000,
      mealSubscriptionAmount: 5000,
      amcChargesAmount: 5000,
    });

    expect(errors).toContain('amount must equal Security Deposit + Advance Rent + Meal Subscription + AMC Charges');
  });
});
