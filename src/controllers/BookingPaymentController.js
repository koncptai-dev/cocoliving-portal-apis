const { Op } = require('sequelize');
const moment = require('moment');

const { createPayment } = require('../utils/phonepe/phonepeApi');
const phonepeConfig = require('../utils/phonepe/phonepeConfig');

const Booking = require('../models/bookRoom');
const PaymentTransaction = require('../models/paymentTransaction');
const PropertyRateCard = require('../models/propertyRateCard');

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

function paiseFromRupees(rupees) {
  return Math.round(Number(rupees || 0) * 100);
}


function createMerchantOrderId({ userId, bookingType }) {
  const typePart = (bookingType || 'full').toString().toLowerCase();
  const ts = Date.now();
  let base = `booking-${userId}-${typePart}-${ts}`;
  if (base.length > 63) base = base.slice(0, 63);
  return base;
}

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

exports.initiate = async (req, res) => {
  try {
    const authenticatedUserId = req.user && req.user.id;
    const bodyUserId = req.body.userId;
    const userId = authenticatedUserId || bodyUserId;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required (or authenticate)' });

    const { bookingType, metadata = {} } = req.body;
    if (!bookingType || !metadata) return res.status(400).json({ success: false, message: 'bookingType and metadata are required' });

    const rateCard = await PropertyRateCard.findByPk(metadata.rateCardId || rateCardId);
    if (!rateCard) {
      return res.status(400).json({ success: false, message: 'Invalid rateCardId' });
    }

    const normalizedCheckIn = moment(checkInDate, ['YYYY-MM-DD','DD-MM-YYYY']).format('YYYY-MM-DD');
    const normalizedCheckOut = moment(normalizedCheckIn).add(Number(duration || 0), 'months').format('YYYY-MM-DD');

    const rebuiltMeta = {
      bookingType: bookingType.toUpperCase() === 'PREBOOK' ? 'PREBOOK' : 'BOOK',
      rateCardId: rateCard.id,
      propertyId: rateCard.propertyId,
      roomType: rateCard.roomType,
      checkInDate: normalizedCheckIn,
      checkOutDate: normalizedCheckOut,
      duration: Number(duration),
      monthlyRent: Number(rateCard.rent),
      securityDeposit: Math.round(Number(rateCard.rent) * 2),
    };


    const overlap = await checkOverlappingBooking(userId, rebuiltMeta.checkInDate, rebuiltMeta.checkOutDate);
    if (overlap) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active/approved/pending booking during this period',
        existingBooking: overlap,
      });
    }

    const canonical = canonicalizeMetadata({
      bookingType: rebuiltMeta.bookingType,
      rateCardId: rebuiltMeta.rateCardId,
      checkInDate: rebuiltMeta.checkInDate,
      duration: rebuiltMeta.duration,
    });

    const existingPendingTxs = await PaymentTransaction.findAll({
      where: { userId, status: 'PENDING' },
      order: [['createdAt', 'ASC']],
    });

    for (const oldTx of existingPendingTxs) {
      try {
        const oldCanon = oldTx.pendingBookingData ? canonicalizeMetadata(oldTx.pendingBookingData) : null;
        if (oldCanon && oldCanon === canonical) {
          oldTx.status = 'EXPIRED';
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

    const totalAmountRupees = rebuiltMeta.monthlyRent * rebuiltMeta.duration + rebuiltMeta.securityDeposit;
    const amountPaise = paiseFromRupees(totalAmountRupees);
    const merchantOrderId = createMerchantOrderId({ userId, bookingType: rebuiltMeta.bookingType });

    const tx = await PaymentTransaction.create({
      merchantOrderId,
      userId,
      amount: amountPaise,
      type: rebuiltMeta.bookingType === 'PREBOOK' ? 'PREBOOK' : 'FULL',
      status: 'PENDING',
      pendingBookingData: {
        bookingType: rebuiltMeta.bookingType,
        rateCardId: rebuiltMeta.rateCardId,
        checkInDate: rebuiltMeta.checkInDate,
        checkOutDate: rebuiltMeta.checkOutDate,
        duration: rebuiltMeta.duration,
        monthlyRent: rebuiltMeta.monthlyRent,
        securityDeposit: rebuiltMeta.securityDeposit,
        totalAmount: totalAmountRupees,
      },
      rawResponse: { note: 'pending transaction created' },
    });

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
    } else {
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
