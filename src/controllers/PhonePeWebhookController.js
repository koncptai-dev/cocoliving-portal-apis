const crypto = require('crypto');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const moment = require('moment');

const PaymentTransaction = require('../models/paymentTransaction');
const Booking = require('../models/bookRoom');
const BookingExtension = require('../models/bookingExtension');
const User = require('../models/user');
const Property = require('../models/property');
const RateCard = require('../models/propertyRateCard');

const phonepeConfig = require('../utils/phonepe/phonepeConfig');
const { logActivity } = require('../helpers/activityLogger');
const { refundCompletedEmail } = require('../utils/emailTemplates/emailTemplates');
const { mailsender } = require('../utils/emailService');

function computeExpectedWebhookHex() {
  const u = (phonepeConfig.WEBHOOK_USERNAME || '').trim();
  const p = (phonepeConfig.WEBHOOK_PASSWORD || '').trim();
  return crypto.createHash('sha256').update(`${u}:${p}`, 'utf8').digest('hex');
}

function extractAndVerifyAuth(req) {
  const header = (req.headers['authorization'] || req.headers['Authorization'] || '').trim();
  if (!header) return false;

  const received = header.toLowerCase().startsWith('sha256 ')
    ? header.slice(7).trim()
    : header.trim();

  const expected = computeExpectedWebhookHex();
  return String(received).toLowerCase() === String(expected).toLowerCase();
}


function parseRoot(req) {
  if (req.rawBodyString) {
    try { return JSON.parse(req.rawBodyString); }
    catch { return req.body || {}; }
  }
  return req.body || {};
}

function normalizeContext(root) {
  const payload = root.payload || {};
  return {
    eventType: root.event || '',
    payload,
    state: String(payload.state || '').toUpperCase(),
    merchantOrderId: payload.merchantOrderId || null,
    merchantRefundId: payload.merchantRefundId || null,
    phonepeOrderId: payload.orderId || null,
    rawRoot: root
  };
}

function isOrderSuccess(ctx) {
  return ctx.eventType === 'checkout.order.completed' && ctx.state === 'COMPLETED';
}

function isOrderFailure(ctx) {
  return ctx.eventType === 'checkout.order.failed' && ctx.state === 'FAILED';
}

function isRefundEvent(ctx) {
  return Boolean(
    ctx.payload.refundId ||
    ctx.merchantRefundId ||
    ctx.eventType.startsWith('pg.refund')
  );
}

async function sendRefundCompletedEmailIfNeeded(refundTx) {
  if (!refundTx) return;
  if (refundTx.status !== 'SUCCESS') return;
  if (refundTx.rawResponse?.refundSuccessEmailSent) return;

  const user = await User.findByPk(refundTx.userId);
  if (!user || !user.email) return;

  let propertyName = '-';

  if (refundTx.bookingId) {
    const booking = await Booking.findByPk(refundTx.bookingId, {
      include: [{ model: Property, as: 'property' }]
    });
    propertyName = booking?.property?.name || '-';
  }
  const email = refundCompletedEmail({
    userName: user.fullName || 'Guest',
    bookingId: refundTx.bookingId,
    propertyName,
    refundAmount: refundTx.amount / 100
  });

  await mailsender(
    user.email,
    'Refund Completed - Coco Living',
    email.html,
    email.attachments
  );
  refundTx.rawResponse = {
    ...(refundTx.rawResponse || {}),
    refundSuccessEmailSent: true
  };
  await refundTx.save();
}

async function recomputeBookingTotals(booking, t = null) {
  const rows = await sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) as paid,
       COALESCE(SUM(CASE WHEN type = 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) as refunded
     FROM payment_transactions
     WHERE "bookingId" = :bookingId`,
    {
      replacements: { bookingId: booking.id },
      type: sequelize.QueryTypes.SELECT,
      transaction: t
    }
  );

  const paid = Number(rows[0]?.paid || 0);
  const refunded = Number(rows[0]?.refunded || 0);
  const netPaid = Math.max(paid - refunded, 0);

  const totalPaise = Math.round(Number(booking.totalAmount || 0) * 100);
  const remainingPaise = Math.max(totalPaise - netPaid, 0);

  booking.remainingAmount = Math.ceil(remainingPaise / 100);

  if (netPaid <= 0) booking.paymentStatus = 'INITIATED';
  else if (netPaid >= totalPaise) booking.paymentStatus = 'COMPLETED';
  else booking.paymentStatus = 'PARTIAL';

  await booking.save({ transaction: t });
}

async function handleRefund(ctx) {
  const refundId =
    ctx.merchantRefundId ||
    ctx.payload.refundId ||
    null;

  if (!refundId) {
    return { status: 200, body: { message: 'Refund webhook processed (no refundId)' } };
  }

  const refundTx = await PaymentTransaction.findOne({
    where: { merchantRefundId: refundId }
  });

  if (!refundTx) {
    return { status: 200, body: { message: 'Refund webhook processed (unknown refund tx)' } };
  }

  refundTx.rawResponse = {
    ...(refundTx.rawResponse || {}),
    refundWebhook: ctx.payload,
    refundWebhookReceivedAt: new Date().toISOString()
  };

  refundTx.webhookProcessedAt = new Date();
  refundTx.merchantRefundId = refundId;

  if (ctx.state === 'COMPLETED' || ctx.state === 'CONFIRMED') refundTx.status = 'SUCCESS';
  else if (ctx.state === 'FAILED') refundTx.status = 'FAILED';
  else refundTx.status = 'PENDING';

  const originalOrderId =
    ctx.payload.originalMerchantOrderId ||
    refundTx.originalMerchantOrderId ||
    null;

  refundTx.originalMerchantOrderId = originalOrderId;
  refundTx.rawResponse.originalMerchantOrderId = originalOrderId;

  await refundTx.save();

  if (refundTx.status === 'SUCCESS' ) {
    try{await sendRefundCompletedEmailIfNeeded(refundTx);}
    catch(err){ console.error('[REFUND EMAIL] Failed to send refund email',err)};
  }
  if (originalOrderId) {
    const origTx = await PaymentTransaction.findOne({
      where: { merchantOrderId: originalOrderId }
    });

    const bookingId = origTx?.bookingId || refundTx.bookingId;
    if (bookingId) {
      const booking = await Booking.findByPk(bookingId);
      if (booking) await recomputeBookingTotals(booking);
    }
  }

  return { status: 200, body: { message: 'Refund webhook processed' } };
}

async function createBookingFromPending(tx, t) {
  const pb = tx.pendingBookingData;

  let checkIn = pb.checkInDate
    ? moment(pb.checkInDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD')
    : moment().format('YYYY-MM-DD');

  let checkOut = pb.checkOutDate
    ? moment(pb.checkOutDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD')
    : moment(checkIn).add(Number(pb.duration || 0), 'months').format('YYYY-MM-DD');

  const overlap = await Booking.findOne({
    where: {
      userId: tx.userId,
      status: { [Op.in]: ['approved', 'active', 'pending'] },
      [Op.or]: [
        { checkOutDate: { [Op.is]: null }, checkInDate: { [Op.lte]: checkOut } },
        { checkOutDate: { [Op.gte]: checkIn }, checkInDate: { [Op.lte]: checkOut } }
      ]
    },
    transaction: t,
    lock: t.LOCK.UPDATE
  });

  if (overlap) {
    tx.rawResponse = {
      ...(tx.rawResponse || {}),
      bookingSkippedDueToOverlap: true,
      overlapBookingId: overlap.id
    };
    await tx.save({ transaction: t });
    return null;
  }

  const booking = await Booking.create({
    propertyId: pb.propertyId,
    userId: tx.userId,
    rateCardId: pb.rateCardId,
    roomType: pb.roomType,
    roomId: null,
    assignedItems: [],
    checkInDate: pb.checkInDate,
    checkOutDate: pb.checkOutDate,
    duration: pb.duration,
    monthlyRent: pb.monthlyRent,
    totalAmount: pb.totalAmount,
    remainingAmount: pb.totalAmount,
    bookingType: pb.bookingType,
    paymentStatus: 'INITIATED',
    status: 'pending',
    meta: pb
  }, { transaction: t });

  tx.bookingId = booking.id;
  await tx.save({ transaction: t });

  const user = await User.findByPk(tx.userId , {transaction: t});
  if(booking){
    await logActivity({
      userId: tx.userId,
      name: user?.fullName || 'System/Webhook',
      role: user.role,
      action: "New Booking",
      entityType: "Booking",
      entityId: booking.id,
      details: { property: pb.propertyId,
        roomType: pb.roomType,
        duration: pb.duration },
    });
  }
  await recomputeBookingTotals(booking, t);
  return booking;
}

async function handleOrderSuccess(ctx, tx) {
  await sequelize.transaction(async (t) => {
    await tx.reload({ transaction: t, lock: t.LOCK.UPDATE });

    if (tx.webhookProcessedAt && tx.status === 'SUCCESS') return;

    tx.status = 'SUCCESS';
    tx.webhookProcessedAt = new Date();
    tx.phonepeOrderId = ctx.phonepeOrderId || tx.phonepeOrderId;
    tx.rawResponse = {
      ...(tx.rawResponse || {}),
      webhookPayload: ctx.rawRoot,
      webhookProcessed: true
    };

    await tx.save({ transaction: t });

    if(tx.type === 'EXTENSION'){
      const extensionData = tx.pendingBookingData?.extension;

      if (!extensionData) {
        console.warn('[WEBHOOK][EXTENSION] Missing extension data', tx.id);
        return;
      }

      // Idempotency guard
      const existingExtension = await BookingExtension.findOne({
        where: { paymentTransactionId: tx.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (existingExtension) {
        console.info('[WEBHOOK][EXTENSION] Already created, skipping', tx.id);
        return;
      }

      await BookingExtension.create({
        bookingId: extensionData.bookingId,
        userId: tx.userId,
        requestedMonths: extensionData.requestedMonths,
        oldCheckOutDate: extensionData.oldCheckOutDate,
        newCheckOutDate: extensionData.newCheckOutDate,
        amountRupees: extensionData.amountRupees,
        status: 'pending',
        paymentTransactionId: tx.id
      }, { transaction: t });

      console.info('[WEBHOOK][EXTENSION] Pending extension created', {
        txId: tx.id,
        bookingId: extensionData.bookingId
      });

      return;
    }

    if (tx.bookingId) {
      const booking = await Booking.findByPk(tx.bookingId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (booking) await recomputeBookingTotals(booking, t);
      return;
    }

    if (tx.pendingBookingData) {
      await createBookingFromPending(tx, t);
    }
  });
}

exports.phonePeWebhook = async (req, res) => {
  try {
    if (!extractAndVerifyAuth(req)) {
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }

    const root = parseRoot(req);
    const ctx = normalizeContext(root);

    if (!ctx.merchantOrderId && !ctx.merchantRefundId) {
      return res.status(200).json({ message: 'Webhook processed (no merchant identifiers)' });
    }

    if (isRefundEvent(ctx)) {
      const result = await handleRefund(ctx);
      return res.status(result.status).json(result.body);
    }

    if (!ctx.merchantOrderId) {
      return res.status(200).json({ message: 'Webhook processed (no merchantOrderId)' });
    }

    const tx = await PaymentTransaction.findOne({
      where: { merchantOrderId: ctx.merchantOrderId }
    });

    if (!tx) {
      return res.status(200).json({ message: 'Webhook processed (unknown transaction)' });
    }

    if (isOrderSuccess(ctx)) {
      await handleOrderSuccess(ctx, tx);
      return res.status(200).json({ message: 'Webhook processed (SUCCESS)' });
    }

    if (isOrderFailure(ctx)) {
      if (tx.status === 'SUCCESS') {
        return res.status(200).json({ message: 'Webhook ignored (transaction already SUCCESS)' });
      }

      tx.status = 'FAILED';
      tx.webhookProcessedAt = new Date();
      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        webhookPayload: ctx.rawRoot,
        webhookProcessed: true
      };
      await tx.save();

      return res.status(200).json({ message: 'Webhook processed (FAILED)' });
    }

    return res.status(200).json({ message: 'Webhook processed (unhandled event)' });

  } catch (err) {
    return res.status(500).json({
      message: 'Server error processing webhook',
      error: err.message
    });
  }
};