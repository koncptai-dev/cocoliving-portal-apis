// src/controllers/BookingPaymentController.js
const { Op } = require('sequelize');
const moment = require('moment');
const sequelize = require('../config/database');

const { createPayment } = require('../utils/phonepe/phonepeApi');
const phonepeConfig = require('../utils/phonepe/phonepeConfig');

const Booking = require('../models/bookRoom');
const PaymentTransaction = require('../models/paymentTransaction');
const PropertyRateCard = require('../models/propertyRateCard');
const User = require('../models/user');

function canonicalizeMetadata(metadata){
  const keys = [
    'rateCardId',
    'propertyId',
    'roomType',
    'checkInDate',
    'checkOutDate',
    'duration',
    'monthlyRent',
    'assignedItems',
    'roomId',
    'bookingType',
  ];
  const out = {};
  keys.forEach((k) => {
    if (metadata && Object.prototype.hasOwnProperty.call(metadata, k)) out[k] = metadata[k];
  });
  return JSON.stringify(out);
}

/**
 * Rebuild metadata from raw incoming object:
 * - normalize date formats
 * - ensure number fields are numbers
 * - compute checkOutDate if not provided
 */
function buildRebuiltMeta(rawMeta, bookingType) {
  const m = Object.assign({}, rawMeta);
  // normalize numeric fields
  if (m.duration !== undefined) m.duration = Number(m.duration || 0);
  if (m.monthlyRent !== undefined) m.monthlyRent = Number(m.monthlyRent || 0);
  if (m.rateCardId !== undefined) m.rateCardId = Number(m.rateCardId);
  if (m.propertyId !== undefined) m.propertyId = Number(m.propertyId);
  if (m.securityDeposit !== undefined) m.securityDeposit = Number(m.securityDeposit);

  // normalize dates
  if (m.checkInDate) {
    m.checkInDate = moment(m.checkInDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD');
  }
  if (m.checkOutDate) {
    m.checkOutDate = moment(m.checkOutDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD');
  } else {
    // compute from duration if available
    if (m.checkInDate && Number.isFinite(m.duration) && m.duration > 0) {
      m.checkOutDate = moment(m.checkInDate).add(Number(m.duration), 'months').format('YYYY-MM-DD');
    } else {
      m.checkOutDate = m.checkInDate || null;
    }
  }

  // bookingType normalized
  m.bookingType = bookingType && String(bookingType).toUpperCase() === 'PREBOOK' ? 'PREBOOK' : 'BOOK';

  return m;
}

function paiseFromRupees(rupees) {
  return Math.round(Number(rupees || 0) * 100);
}

function computeTotalAmountRupees(meta) {
  if (meta.totalAmount && Number.isFinite(Number(meta.totalAmount))) {
    return Math.round(Number(meta.totalAmount));
  }
  const monthly = Number(meta.monthlyRent || 0);
  const dur = Number(meta.duration || 0);
  const sec = Number(meta.securityDeposit || 0);
  return Math.round(monthly * dur + sec);
}

function createMerchantOrderId({ userId, bookingType }) {
  const typePart = (bookingType || 'full').toString().toLowerCase();
  const ts = Date.now();
  let base = `booking-${userId}-${typePart}-${ts}`;
  if (base.length > 63) base = base.slice(0, 63);
  return base;
}

/**
 * Overlap check using same rules as original Booking.create
 * Return overlapping booking or null
 */
async function checkOverlappingBooking(userId, checkInDate, checkOutDate) {
  const checkIn = moment(checkInDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD');
  const checkOut = moment(checkOutDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD');

  const overlappingBooking = await Booking.findOne({
    where: {
      userId,
      status: { [Op.in]: ['approved', 'active', 'pending'] },
      [Op.or]: [
        {
          checkOutDate: { [Op.is]: null },
          checkInDate: { [Op.lte]: checkOut },
        },
        {
          checkOutDate: { [Op.gte]: checkIn },
          checkInDate: { [Op.lte]: checkOut },
        },
      ],
    },
  });

  return overlappingBooking;
}

/**
 * Initiate payment endpoint
 * - validates metadata
 * - runs overlap check (reject if overlapping approved/active/pending booking exists)
 * - auto-expire previous PENDING duplicates by marking them EXPIRED (uses EXPIRED enum)
 * - creates new PENDING PaymentTransaction with pendingBookingData
 * - calls PhonePe create and stores phonepe response in rawResponse and redirectUrl
 */
exports.initiate = async (req, res) => {
  try {
    // userId from JWT if present; if not present, accept body.userId (legacy)
    const authenticatedUserId = req.user && req.user.id;
    const bodyUserId = req.body.userId;
    const userId = authenticatedUserId || bodyUserId;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required (or authenticate)' });

    const { bookingType, metadata = {} } = req.body;
    if (!bookingType || !metadata) return res.status(400).json({ success: false, message: 'bookingType and metadata are required' });

    // validate required fields - same as earlier
    const required = ['rateCardId', 'propertyId', 'roomType', 'checkInDate', 'duration', 'monthlyRent'];
    for (const f of required) {
      if (metadata[f] === undefined || metadata[f] === null) {
        return res.status(400).json({ success: false, message: `metadata.${f} is required` });
      }
    }

    // Build canonical rebuilt meta (normalized)
    const rebuiltMeta = buildRebuiltMeta(metadata, bookingType);

    // Validate metadata consistency: caller must not send conflicting data
    // If something is inconsistent (e.g., checkOutDate earlier than checkInDate) -> reject
    if (rebuiltMeta.checkInDate && rebuiltMeta.checkOutDate) {
      if (moment(rebuiltMeta.checkOutDate).isBefore(moment(rebuiltMeta.checkInDate))) {
        return res.status(400).json({ success: false, message: 'metadata.checkOutDate cannot be before checkInDate' });
      }
    }

    // Overlap check: block initiation if overlapping approved/active/pending booking exists
    const overlap = await checkOverlappingBooking(userId, rebuiltMeta.checkInDate, rebuiltMeta.checkOutDate);
    if (overlap) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active/approved/pending booking during this period',
        existingBooking: overlap,
      });
    }

    // Canonical string used to detect duplicate intent
    const canonical = canonicalizeMetadata(Object.assign({}, rebuiltMeta, { bookingType: rebuiltMeta.bookingType }));

    // Auto-expire previous pending txn duplicates (we will mark status = 'EXPIRED' for those matching canonical)
    const existingPendingTxs = await PaymentTransaction.findAll({
      where: { userId, status: 'PENDING' },
      order: [['createdAt', 'ASC']],
    });

    for (const oldTx of existingPendingTxs) {
      try {
        const oldCanon = oldTx.pendingBookingData ? canonicalizeMetadata(oldTx.pendingBookingData) : null;
        if (oldCanon && oldCanon === canonical) {
          oldTx.status = 'EXPIRED'; // use EXPIRED enum present in model
          oldTx.rawResponse = Object.assign({}, oldTx.rawResponse || {}, {
            autoExpired: true,
            expiredAt: new Date().toISOString(),
            reason: 'A new initiation was created for the same booking intent',
          });
          await oldTx.save();
        }
      } catch (err) {
        console.warn('[BookingPaymentController] expire-old-tx error', err);
      }
    }

    // compute amounts & merchantOrderId
    const totalAmountRupees = computeTotalAmountRupees(rebuiltMeta);
    const amountPaise = paiseFromRupees(totalAmountRupees);
    const merchantOrderId = createMerchantOrderId({ userId, bookingType: rebuiltMeta.bookingType });

    // create PENDING transaction with pendingBookingData
    const tx = await PaymentTransaction.create({
      merchantOrderId,
      userId,
      amount: amountPaise,
      type: rebuiltMeta.bookingType === 'PREBOOK' ? 'PREBOOK' : 'FULL',
      status: 'PENDING',
      pendingBookingData: Object.assign({}, rebuiltMeta, { totalAmount: totalAmountRupees, bookingType: rebuiltMeta.bookingType }),
      rawResponse: { note: 'pending transaction created' },
    });

    // Build PhonePe payload
    const phonepePayload = {
      merchantOrderId,
      amount: amountPaise,
      metaInfo: { udf1: String(userId), udf2: merchantOrderId },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: phonepeConfig.REDIRECT_URL },
      },
    };

    const phonepeResp = await createPayment(phonepePayload);

    tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { phonepeCreateResponse: phonepeResp });
    if (phonepeResp && phonepeResp.success && phonepeResp.body) {
      tx.phonepeOrderId = phonepeResp.body.orderId || tx.phonepeOrderId || null;
      tx.redirectUrl = phonepeResp.body.redirectUrl || phonepeResp.body.checkoutUrl || tx.redirectUrl || null;
      // keep status PENDING until webhook
    } else {
      // mark FAILED if create call failed
      if (!phonepeResp || !phonepeResp.success) {
        tx.status = 'FAILED';
      }
    }
    await tx.save();

    return res.json({
      message: 'Payment initiated',
      phonepe: phonepeResp,
      redirectUrl: tx.redirectUrl,
      transaction: tx,
    });
  } catch (err) {
    console.error('[BookingPaymentController] initiate error', err);
    return res.status(500).json({ success: false, message: `Failed to initiate payment: ${err.message || err}` });
  }
};

/**
 * getBookingPaymentSummary - returns booking, totals, transactions
 */
exports.getBookingPaymentSummary = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId param is required' });

    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const PaymentTransactionModel = require('../models/paymentTransaction');
    const transactions = await PaymentTransactionModel.findAll({
      where: { bookingId: booking.id },
      order: [['createdAt', 'ASC']],
    });

    const totalPaidPaise = transactions.filter(t => t.status === 'SUCCESS' && t.type !== 'REFUND').reduce((s, t) => s + Number(t.amount || 0), 0);
    const netPaidPaise = totalPaidPaise;
    const totalAmountPaise = Number(booking.totalAmount || 0) * 100;
    const remainingPaise = Math.max(totalAmountPaise - netPaidPaise, 0);

    return res.json({
      booking,
      bookingType: booking.bookingType,
      paymentStatus: booking.paymentStatus,
      totals: {
        totalAmountRupees: booking.totalAmount || 0,
        totalPaidRupees: Math.round(netPaidPaise / 100),
        remainingRupees: Math.round(remainingPaise / 100),
      },
      transactions,
    });
  } catch (err) {
    console.error('[BookingPaymentController] getBookingPaymentSummary error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
