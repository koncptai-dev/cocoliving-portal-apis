const sequelize = require('../config/database');
const PaymentTransaction = require('../models/paymentTransaction');
const Booking = require('../models/bookRoom');
const User = require('../models/user');
const {
  fetchOrder,
  fetchPayment,
} = require('../utils/razorpay/razorpayApi');
const { Op } = require('sequelize');
const { logApiCall } = require("../helpers/auditLog");
const { calculateBookingFinancials, validateOfflinePaymentPayload } = require('../helpers/bookingEditUtils');
const { buildBookingPaymentReview } = require('../helpers/bookingPaymentReview');
const { Property, Rooms } = require('../models');
// const { generateAndSendInvoice } = require('../utils/invoiceService');
const { generateAndSendAcknowledgementReceipt } = require('../utils/acknowledgementReceiptService');

exports.checkOrderStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      await logApiCall(req, res, 400, "Checked order status - merchantOrderId required", "payment");
      return res.status(400).json({
        message: "merchantOrderId required"
      });
    }

    const tx = await PaymentTransaction.findOne({
      where: { merchantOrderId },
    });

    if (!tx) {
      return res.status(404).json({
        message: "Payment transaction not found",
      });
    }

    if (!tx.providerOrderId) {
      return res.status(400).json({
        message: "Payment provider order ID not found",
      });
    }

    const razorpayOrder = await fetchOrder(
      tx.providerOrderId
    );

    let razorpayPayment = null;

    if (tx.providerPaymentId) {
      try {
        razorpayPayment = await fetchPayment(
          tx.providerPaymentId
        );
      } catch (paymentErr) {
        console.warn(
          '[PaymentController] Unable to fetch Razorpay payment',
          paymentErr.message
        );
      }
    }

    tx.rawResponse = Object.assign(
      {},
      tx.rawResponse || {},
      {
        orderStatusCheck: {
          order: razorpayOrder,
          payment: razorpayPayment,
        },
        lastPolledAt:
          new Date().toISOString(),
      }
    );

    await tx.save();

    const orderState = String(
      razorpayOrder?.status || ''
    ).toLowerCase();

    const paymentState = String(
      razorpayPayment?.status || ''
    ).toLowerCase();

    let derivedStatus = "PENDING";

    if (
      orderState === 'paid' ||
      paymentState === 'captured'
    ) {
      derivedStatus = "SUCCESS";
    } else if (
      paymentState === 'failed'
    ) {
      derivedStatus = "FAILED";
    }

    await logApiCall(
      req,
      res,
      200,
      `Checked order status: ${merchantOrderId} (Status: ${derivedStatus})`,
      "payment"
    );

    return res.status(200).json({
      status: derivedStatus,
      razorpay: {
        order: razorpayOrder,
        payment: razorpayPayment,
      },
      transaction: tx,
    });
  } catch (err) {
    console.error(
      "[PaymentController] checkOrderStatus error",
      err
    );

    await logApiCall(
      req,
      res,
      500,
      "Error occurred while checking order status",
      "payment"
    );

    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      await logApiCall(req, res, 401, "Viewed user transactions - unauthorized", "payment");
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const filterType = req.query.type;
    const filterStatus = req.query.status;
    const paymentMode = req.query.paymentMode;

    const where = { userId };
    if (filterType) where.type = filterType;
    if (filterStatus) where.status = filterStatus;
    if (paymentMode) where.paymentMode = paymentMode.toUpperCase();

    if (q) {
      const Op = require('sequelize').Op;
      where[Op.or] = [
        { merchantOrderId: { [Op.iLike]: `%${q}%` } },
        { providerOrderId: { [Op.iLike]: `%${q}%` } },
        { merchantRefundId: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await PaymentTransaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    const payments = rows.map((r) => {
      const amountPaise = Number(r.amount || 0);
      return {
        id: r.id,
        merchantOrderId: r.merchantOrderId,
        merchantRefundId: r.merchantRefundId || null,
        provider: r.provider || null,
        providerOrderId: r.providerOrderId || null,
        providerPaymentId: r.providerPaymentId || null,
        providerRefundId: r.providerRefundId || null,
        bookingId: r.bookingId || null,
        amountPaise,
        amountRupees: Math.round(amountPaise / 100),
        type: r.type,
        status: r.status,
        redirectUrl: r.redirectUrl || null,
        rawResponse: r.rawResponse || null,
        refundReason: r.refundReason || null,
        paymentMode: r.paymentMode,
        offlinePaymentType: r.offlinePaymentType,
        adminNote: r.adminNote,
        discountAmount: r.discountAmount,
        createdByAdminId: r.createdByAdminId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        invoicePdfPath: r.invoicePdfPath,
        additionalDetails: r.additionalDetails === true,
        ...(r.additionalDetails === true && {
          advanceRent: r.advanceRentAmount,
          securityDeposit: r.securityDepositAmount,
          amcCharges: r.amcChargesAmount,
          mealSubscriptionCharges: r.mealSubscriptionAmount,
          mealSubscriptionDuration: r.mealSubscriptionDurationMonths,
          totalAmount: r.totalAmountReceived,
        }),
      };
    });

    await logApiCall(req, res, 200, `Viewed user transactions (${count} total)`, "payment", userId);
    return res.json({
      success: true,
      page,
      limit,
      total: count,
      payments,
    });
  } catch (err) {
    console.error('[PaymentController] getUserTransactions error', err);
    await logApiCall(req, res, 500, "Error occurred while fetching user transactions", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      query = "",
      status = "",
      type = ""
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const offset = (page - 1) * limit;

    const where = {};

    if (query) {
      where[Op.or] = [
        { merchantOrderId: { [Op.iLike]: `%${query}%` } },
        { providerOrderId: { [Op.iLike]: `%${query}%` } },
        { merchantRefundId: { [Op.iLike]: `%${query}%` } },
        { '$user.fullName$': { [Op.iLike]: `%${query}%` } },
        { '$user.email$': { [Op.iLike]: `%${query}%` } },
      ];
    }

    if (status) where.status = status.toUpperCase();
    if (type) where.type = type.toUpperCase();

    const { rows, count } = await PaymentTransaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as : 'user', attributes: ['id','fullName', 'email'] }
      ],
      limit,
      offset,
    });

    await logApiCall(req, res, 200, `Viewed all transactions (${count} total)`, "payment");
    return res.json({
      success: true,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      },
      data: rows
    });
  } catch (err) {
    console.error("getTransactions error", err);
    await logApiCall(req, res, 500, "Error occurred while fetching all transactions", "payment");
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getRefundInfo = async (req, res) => {
  try {
    const txId = req.params.transactionId;

    const tx = await PaymentTransaction.findByPk(txId);
    if (!tx) {
      await logApiCall(req, res, 404, `Viewed refund info - transaction not found (ID: ${txId})`, "payment", parseInt(txId));
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const originalOrderId = tx.merchantOrderId;

    const successfulRefunds = await PaymentTransaction.sum('amount', {
      where: {
        originalMerchantOrderId: originalOrderId,
        status: 'SUCCESS',
        type: 'REFUND',
      },
    });

    const paidPaise = tx.amount;
    const refundedPaise = successfulRefunds || 0;
    const maxRefundable = Math.max(paidPaise - refundedPaise, 0);

    await logApiCall(req, res, 200, `Viewed refund info for transaction (ID: ${txId})`, "payment", parseInt(txId));
    return res.json({
      transactionId: txId,
      merchantOrderId: originalOrderId,
      paidPaise,
      refundedPaise,
      maxRefundablePaise: maxRefundable,
      maxRefundableRupees: Math.round(maxRefundable / 100),
    });
  } catch (err) {
    console.error('Refund Info Error:', err);
    await logApiCall(req, res, 500, "Error occurred while fetching refund info", "payment", parseInt(req.params.transactionId) || 0);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createOfflinePayment = async (req, res) => {
  try {
    const adminId = req.user?.id;

    const {
      bookingId,
      amount,
      adminNote,
      paymentType,
      discountAmount = 0,
      paymentDate
    } = req.body;
    let formattedPaymentDate = null;

    if (paymentDate) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) {
        return res.status(400).json({
          success: false,
          message: "paymentDate must be in DD/MM/YYYY format",
        });
      }

      formattedPaymentDate = paymentDate;
    }

    if (!bookingId || !amount || !paymentType) {
      return res.status(400).json({
        success: false,
        message: 'bookingId, amount and paymentType are required'
      });
    }

    if (!['CASH', 'CHEQUE', 'UPI'].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid paymentType'
      });
    }

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const payableAmount = Number(amount);
    const finalDiscount = Number(discountAmount || 0);

    if (payableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const amountPaise = Math.round(payableAmount * 100);

    const paymentImage = req.file
      ? `/uploads/paymentProofs/${req.file.filename}`
      : null;

    const transaction = await PaymentTransaction.create({
      bookingId: booking.id,
      userId: booking.userId,

      merchantOrderId: `OFFLINE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,

      amount: amountPaise,

      type: 'OFFLINE',

      status: 'SUCCESS',

      paymentMode: 'OFFLINE',

      offlinePaymentType: paymentType,

      adminNote: adminNote || null,

      paymentImage,

      discountAmount: finalDiscount,

      createdByAdminId: adminId,

      paymentDate: formattedPaymentDate,

      rawResponse: {
        manuallyCreated: true,
        createdAt: new Date().toISOString(),
      },

      meta: {
        source: 'admin-panel'
      }
    });

    // await generateAndSendInvoice(transaction);
    await generateAndSendAcknowledgementReceipt(transaction);

    booking.bookingSource = 'OFFLINE';

    const currentRemaining = Number(booking.remainingAmount || 0);

    const updatedRemaining =
      currentRemaining - payableAmount - finalDiscount;

    booking.remainingAmount = Math.max(
      Math.round(updatedRemaining),
      0
    );

    const successfulPayments = await PaymentTransaction.findAll({
      where: {
        bookingId: booking.id,
        status: 'SUCCESS',
        type: {
          [Op.ne]: 'REFUND'
        }
      }
    });

    const totalPaidPaise = successfulPayments.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0
    );

    const totalPaidRupees = totalPaidPaise / 100;

    const effectivePaid =
      totalPaidRupees + finalDiscount;

    if (effectivePaid >= Number(booking.totalAmount || 0)) {
      booking.paymentStatus = 'COMPLETED';
    } else if (effectivePaid > 0) {
      booking.paymentStatus = 'PARTIAL';
    }

    await booking.save();

    await logApiCall(
      req,
      res,
      200,
      `Offline payment created for booking ${booking.id}`,
      'payment',
      adminId
    );

    return res.status(201).json({
      success: true,
      message: 'Offline payment created successfully',
      transaction,
    });

  } catch (err) {
    console.error('[createOfflinePayment]', err);

    await logApiCall(
      req,
      res,
      500,
      'Error while creating offline payment',
      'payment',
      req.user?.id || 0
    );

    return res.status(500).json({
      success: false,
      message: err.message || 'Server error'
    });
  }
};

exports.createInitialOfflinePayment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const adminId = req.user?.id;
    const { bookingId, paymentType = 'CASH', paymentDate } = req.body;

    if (!bookingId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'bookingId is required' });
    }

    const normalizedPaymentType = String(paymentType).toUpperCase();
    if (!['CASH', 'CHEQUE', 'UPI'].includes(normalizedPaymentType)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'paymentType must be CASH, CHEQUE or UPI' });
    }

    let formattedPaymentDate = null;
    if (paymentDate) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'paymentDate must be in DD/MM/YYYY format'
        });
      }
      formattedPaymentDate = paymentDate;
    }
    const lockedBooking = await Booking.findOne({
      where: { id: bookingId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!lockedBooking) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = await Booking.findOne({
      where: { id: bookingId },
      include: [
        { model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'phone'] },
        { model: Rooms, as: 'room', attributes: ['id', 'roomNumber', 'roomType', 'monthlyRent', 'depositAmount'] },
        { model: Property, as: 'property', attributes: ['id', 'name', 'address', 'mealSubscriptionAmountTwoTimes', 'mealSubscriptionAmountFourTimes'] }
      ],
      transaction
    });

    const existingPayment = await PaymentTransaction.findOne({
      where: {
        bookingId: booking.id,
        status: 'SUCCESS',
        type: { [Op.ne]: 'REFUND' }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (existingPayment) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'An initial payment already exists for this booking. Use the offline payment API for subsequent payments.'
      });
    }

    const { errors, review } = await buildBookingPaymentReview(req.body, booking, transaction);

    if (errors.length > 0) {
      await transaction.rollback();
      await logApiCall(req, res, 400, `Created initial offline payment - validation failed (Booking ID: ${booking.id})`, 'payment', adminId || 0);
      return res.status(400).json({
        success: false,
        message: 'Initial payment validation failed',
        errors,
        review
      });
    }

    const amountReceived = review.calculated.totalAmountReceived;
    const amountPaise = Math.round(amountReceived * 100);

    const paymentImage = req.file
      ? `/uploads/paymentProofs/${req.file.filename}`
      : null;

    const paymentTransaction = await PaymentTransaction.create({
      bookingId: booking.id,
      userId: booking.userId,

      merchantOrderId: `INITIAL-${booking.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,

      amount: amountPaise,
      type: 'INITIAL',
      status: 'SUCCESS',
      paymentMode: 'OFFLINE',
      offlinePaymentType: normalizedPaymentType,
      paymentDate: formattedPaymentDate,
      paymentImage,

      additionalDetails: true,

      totalAmountReceived: review.inputs.totalAmountReceived,
      waiveCurrentMonthRent: review.inputs.waiveCurrentMonthRent,
      securityDepositType: review.inputs.securityDepositType,
      securityDepositAmount: review.inputs.securityDepositAmount,
      advanceRentAmount: review.inputs.advanceRent,
      advanceRentDurationMonths: review.inputs.advanceRentDurationMonths,
      mealSubscriptionAmount: review.inputs.mealSubscriptionAmount,
      mealSubscriptionDurationMonths: review.inputs.mealSubscriptionDurationMonths,
      amcChargesAmount: review.inputs.amcCharges,
      panCardNumber: review.inputs.panCardNumber,

      createdByAdminId: adminId,

      rawResponse: {
        manuallyCreated: true,
        createdFrom: 'admin-initial-offline-payment',
        createdAt: new Date().toISOString()
      },

      meta: {
        source: 'admin-panel',
        flow: 'initial-offline-payment'
      }
    }, { transaction });

    await generateAndSendAcknowledgementReceipt(paymentTransaction);

    booking.bookingSource = 'OFFLINE';

    if (review.inputs.securityDepositAmount > 0) {
      booking.securityDepositPaid = true;
    }

    const successfulPayments = await PaymentTransaction.findAll({
      where: {
        bookingId: booking.id,
        status: 'SUCCESS',
        type: { [Op.ne]: 'REFUND' }
      },
      transaction
    });

    const totalPaidPaise = successfulPayments.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0
    );
    const totalPaidRupees = totalPaidPaise / 100;

    booking.remainingAmount = Math.max(
      Math.round(Number(booking.totalAmount || 0) - totalPaidRupees),
      0
    );

    booking.paymentStatus =
      totalPaidRupees >= Number(booking.totalAmount || 0)
        ? 'COMPLETED'
        : totalPaidRupees > 0
          ? 'PARTIAL'
          : 'INITIATED';

    await booking.save({ transaction });

    await transaction.commit();

    await logApiCall(
      req,
      res,
      200,
      `Initial offline payment created for booking ${booking.id}`,
      'payment',
      adminId
    );

    return res.status(201).json({
      success: true,
      message: 'Initial offline payment created successfully',
      booking,
      transaction: paymentTransaction,
      review
    });

  } catch (err) {
    await transaction.rollback();
    console.error('[createInitialOfflinePayment]', err);
    await logApiCall(
      req,
      res,
      500,
      'Error while creating initial offline payment',
      'payment',
      req.user?.id || 0
    );
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error'
    });
  }
};

exports.editOfflinePayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    const { transactionId } = req.params;
    const body = req.body || {};

    const payment = await PaymentTransaction.findByPk(transactionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!payment) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Payment transaction not found" });
    }

    const booking = await Booking.findByPk(payment.bookingId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.bookingSource !== "OFFLINE") {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Only payments for offline bookings can be edited" });
    }

    const paymentDate = body.paymentDate ?? payment.paymentDate;
    if (paymentDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "paymentDate must be in DD/MM/YYYY format" });
    }

    if (body.amount !== undefined) {
      const parsedAmount = Number(body.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: "amount must be a positive number" });
      }
      payment.amount = Math.round(parsedAmount * 100);
    }

    const paymentType = body.offlinePaymentType ?? body.paymentType ?? payment.offlinePaymentType;
    if (paymentType !== undefined && !['CASH', 'CHEQUE', 'UPI'].includes(paymentType)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Invalid paymentType" });
    }

    const effectiveAmount = body.amount !== undefined ? Number(body.amount) : Number(payment.amount || 0) / 100;
    const effectiveSecurityDepositAmount = Object.prototype.hasOwnProperty.call(body, "securityDepositAmount")
      ? Number(body.securityDepositAmount || 0)
      : Number(payment.securityDepositAmount || 0);
    const effectiveAdvanceRentAmount = Object.prototype.hasOwnProperty.call(body, "advanceRentAmount")
      ? Number(body.advanceRentAmount || 0)
      : Number(payment.advanceRentAmount || 0);
    const effectiveMealSubscriptionAmount = Object.prototype.hasOwnProperty.call(body, "mealSubscriptionAmount")
      ? Number(body.mealSubscriptionAmount || 0)
      : Number(payment.mealSubscriptionAmount || 0);
    const effectiveAmcChargesAmount = Object.prototype.hasOwnProperty.call(body, "amcChargesAmount")
      ? Number(body.amcChargesAmount || 0)
      : Number(payment.amcChargesAmount || 0);

    const validationErrors = validateOfflinePaymentPayload({
      amount: effectiveAmount,
      securityDepositAmount: effectiveSecurityDepositAmount,
      advanceRentAmount: effectiveAdvanceRentAmount,
      mealSubscriptionAmount: effectiveMealSubscriptionAmount,
      amcChargesAmount: effectiveAmcChargesAmount,
    });

    if (validationErrors.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Payment validation failed", errors: validationErrors });
    }

    const paymentImage = req.file
      ? `/uploads/paymentProofs/${req.file.filename}`
      : Object.prototype.hasOwnProperty.call(body, "paymentImage")
        ? body.paymentImage
        : payment.paymentImage;

    payment.paymentDate = paymentDate || null;
    payment.offlinePaymentType = paymentType || null;
    payment.adminNote = body.adminNote !== undefined ? body.adminNote : payment.adminNote;
    payment.paymentImage = paymentImage;
    payment.securityDepositType = Object.prototype.hasOwnProperty.call(body, "securityDepositType") ? body.securityDepositType : payment.securityDepositType;
    payment.securityDepositAmount = Object.prototype.hasOwnProperty.call(body, "securityDepositAmount") ? Number(body.securityDepositAmount) : payment.securityDepositAmount;
    payment.advanceRentAmount = Object.prototype.hasOwnProperty.call(body, "advanceRentAmount") ? Number(body.advanceRentAmount) : payment.advanceRentAmount;
    payment.advanceRentDurationMonths = Object.prototype.hasOwnProperty.call(body, "advanceRentDurationMonths") ? Number(body.advanceRentDurationMonths) : payment.advanceRentDurationMonths;
    payment.mealAmount = Object.prototype.hasOwnProperty.call(body, "mealAmount") ? Number(body.mealAmount) : payment.mealAmount;
    payment.mealSubscriptionAmount = Object.prototype.hasOwnProperty.call(body, "mealSubscriptionAmount") ? Number(body.mealSubscriptionAmount) : payment.mealSubscriptionAmount;
    payment.mealSubscriptionDurationMonths = Object.prototype.hasOwnProperty.call(body, "mealSubscriptionDurationMonths") ? Number(body.mealSubscriptionDurationMonths) : payment.mealSubscriptionDurationMonths;
    payment.amcChargesAmount = Object.prototype.hasOwnProperty.call(body, "amcChargesAmount") ? Number(body.amcChargesAmount) : payment.amcChargesAmount;
    payment.panCardNumber = Object.prototype.hasOwnProperty.call(body, "panCardNumber") ? body.panCardNumber : payment.panCardNumber;

    await payment.save({ transaction });

    const successfulPayments = await PaymentTransaction.findAll({
      where: {
        bookingId: booking.id,
        status: "SUCCESS",
        type: { [Op.ne]: "REFUND" },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const paidAmount = successfulPayments.reduce(
      (sum, tx) => sum + Number(tx.amount || 0) / 100,
      0
    );

    const securityDepositAmount = Number(booking.monthlyRent || 0) * 2;
    const financials = calculateBookingFinancials({
      monthlyRent: booking.monthlyRent,
      duration: booking.duration,
      amc: payment.amcChargesAmount,
      paidAmount,
      securityDeposit: payment.securityDepositAmount
    });

    booking.totalAmount = financials.totalAmount;
    booking.remainingAmount = financials.remainingAmount;
    booking.securityDepositPaid = financials.securityDepositPaid;
    await booking.save({ transaction });

    await transaction.commit();
    committed = true;

    await logApiCall(req, res, 200, `Edited offline payment transaction ${payment.id}`, "payment", payment.id);

    return res.status(200).json({
      success: true,
      message: "Offline payment updated successfully",
      payment,
      booking,
      financials,
    });
  } catch (err) {
    if (!committed) await transaction.rollback();
    console.error("[editOfflinePayment]", err);
    await logApiCall(req, res, 500, "Error while editing offline payment", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};