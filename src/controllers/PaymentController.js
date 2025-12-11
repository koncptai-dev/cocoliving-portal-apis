const crypto = require('crypto');
const PaymentTransaction = require('../models/paymentTransaction');
const User = require('../models/user');
const Booking = require('../models/bookRoom');
const { getOrderStatus } = require('../utils/phonepe/phonepeApi');
const phonepeConfig = require('../utils/phonepe/phonepeConfig');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const moment = require('moment');

function computeExpectedWebhookHex() {
  const username = (phonepeConfig.WEBHOOK_USERNAME || '').trim();
  const password = (phonepeConfig.WEBHOOK_PASSWORD || '').trim();
  const input = `${username}:${password}`;
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function parsePayload(req) {
  if (req.rawBodyString) {
    try {
      return JSON.parse(req.rawBodyString);
    } catch (e) {
      return req.body || {};
    }
  }
  return req.body || {};
}

function verifyWebhookAuth(receivedHex) {
  try {
    if (!receivedHex) return false;
    const expectedHex = computeExpectedWebhookHex();
    return String(receivedHex).toLowerCase() === String(expectedHex).toLowerCase();
  } catch (err) {
    console.error('[WEBHOOK] verifyWebhookAuth error', err);
    return false;
  }
}

function isSuccessEvent(event, state) {
  return String(event) === 'checkout.order.completed' && String(state || '').toUpperCase() === 'COMPLETED';
}
function isFailedEvent(event, state) {
  return String(event) === 'checkout.order.failed' && String(state || '').toUpperCase() === 'FAILED';
}
async function recomputeBookingTotals(booking, t = null) {
  if (!booking) return null;
  const replacements = { bookingId: booking.id };

  const paidAndRefunded = await sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) as total_paid_paise,
       COALESCE(SUM(CASE WHEN type = 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) as total_refunded_paise
     FROM payment_transactions
     WHERE "bookingId" = :bookingId`,
    { replacements, transaction: t, type: sequelize.QueryTypes.SELECT }
  );

  const total_paid_paise = Number((paidAndRefunded && paidAndRefunded[0] && paidAndRefunded[0].total_paid_paise) || 0);
  const total_refunded_paise = Number((paidAndRefunded && paidAndRefunded[0] && paidAndRefunded[0].total_refunded_paise) || 0);

  const netPaidPaise = Math.max(total_paid_paise - total_refunded_paise, 0);

  const totalAmountPaise = Math.round(Number(booking.totalAmount || 0) * 100);
  const remainingPaise = Math.max(totalAmountPaise - netPaidPaise, 0);

  booking.remainingAmount = Math.ceil(remainingPaise / 100);
  if (netPaidPaise <= 0) booking.paymentStatus = 'INITIATED';
  else if (netPaidPaise >= totalAmountPaise) booking.paymentStatus = 'COMPLETED';
  else booking.paymentStatus = 'PARTIAL';

  await booking.save({ transaction: t });
  return booking;
}
exports.checkOrderStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;
    if (!merchantOrderId)
      return res.status(400).json({ message: "merchantOrderId required" });

    // 1. Fetch from PhonePe
    const phonepeResp = await getOrderStatus(merchantOrderId);

    // 2. Load existing transaction
    const tx = await PaymentTransaction.findOne({
      where: { merchantOrderId },
    });

    if (tx) {
      // Only store the raw snapshot – do NOT change status here
      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, {
        orderStatusCheck: phonepeResp,
        lastPolledAt: new Date().toISOString(),
      });

      await tx.save(); // simple update only, non-destructive
    }

    // 3. Derive state without modifying DB
    const mappedState =
      (phonepeResp &&
        phonepeResp.body &&
        (phonepeResp.body.state ||
          phonepeResp.body.status ||
          phonepeResp.body.transactionStatus)) ||
      "";

    const stateUpper = String(mappedState).toUpperCase();

    let derivedStatus = "PENDING";
    if (stateUpper.includes("SUCCESS") || stateUpper === "COMPLETED")
      derivedStatus = "SUCCESS";
    else if (
      stateUpper.includes("FAILED") ||
      stateUpper === "FAILED" ||
      stateUpper === "DECLINED"
    )
      derivedStatus = "FAILED";

    return res.status(200).json({
      status: derivedStatus,
      phonepe: phonepeResp,
      transaction: tx || null,
    });
  } catch (err) {
    console.error("[PaymentController] checkOrderStatus error", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.phonePeWebhook = async (req, res) => {
  try {
    let authHeader = (req.headers['authorization'] || req.headers['Authorization'] || '').trim();
    if (!authHeader) {
      console.warn('[WEBHOOK] Missing Authorization header');
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }
    let receivedHex = authHeader.toLowerCase().startsWith('sha256 ')
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (!verifyWebhookAuth(receivedHex)) {
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }
    const root = parsePayload(req);
    const eventType = root.event || '';
    const incomingPayload = root.payload || {};
    const state = (incomingPayload.state || '').toUpperCase();
    const merchantOrderId = incomingPayload.merchantOrderId || null;
    const merchantRefundId = incomingPayload.merchantRefundId || null;
    const phonepeOrderId = incomingPayload.orderId || null;

    if (!merchantOrderId && !merchantRefundId) {
      console.warn('[WEBHOOK] No merchantOrderId or merchantRefundId found; ignoring', { eventType, root });
      return res.status(200).json({ message: 'Webhook processed (no merchant identifiers)' });
    }

    // REFUND events
    if (incomingPayload.refundId || merchantRefundId || eventType.startsWith("pg.refund")) {

      console.info("\x1b[36m[WEBHOOK] Refund event detected\x1b[0m", {
        eventType,
        merchantRefundId,
        refundId: incomingPayload.refundId
      });

      const resolvedRefundId =
        merchantRefundId ||
        incomingPayload.refundId ||
        null;

      if (!resolvedRefundId) {
        console.warn("[WEBHOOK] Refund event without refundId/merchantRefundId");
        return res.status(200).json({ message: "Refund webhook processed (no refundId)" });
      }

      // Find the refund transaction
      const refundTx = await PaymentTransaction.findOne({
        where: {
          [Op.or]: [
            { merchantRefundId: resolvedRefundId },
            { refundId: resolvedRefundId }
          ]
        }
      });

      if (!refundTx) {
        console.warn("[WEBHOOK] Refund Tx not found for refundId", resolvedRefundId);
        return res.status(200).json({ message: "Refund webhook processed (unknown refund tx)" });
      }

      // Attach webhook payload
      refundTx.rawResponse = Object.assign({}, refundTx.rawResponse || {}, {
        refundWebhook: incomingPayload,
        refundWebhookReceivedAt: new Date().toISOString()
      });
      refundTx.merchantRefundId = resolvedRefundId;
      refundTx.refundId = incomingPayload.refundId || refundTx.refundId;
      refundTx.webhookProcessedAt = new Date();

      const refundState = String(incomingPayload.state || "").toUpperCase();

      if (refundState === "COMPLETED" || refundState === "CONFIRMED") refundTx.status = "SUCCESS";
      else if (refundState === "FAILED") refundTx.status = "FAILED";
      else refundTx.status = "PENDING";
      const resolvedOriginal = incomingPayload.originalMerchantOrderId || refundTx.originalMerchantOrderId || null;
      refundTx.originalMerchantOrderId = resolvedOriginal;

      refundTx.rawResponse = Object.assign({}, refundTx.rawResponse || {}, {
        originalMerchantOrderId: resolvedOriginal
      });

      await refundTx.save();

      // Handle booking recompute
      const originalOrderId =
        refundTx.originalMerchantOrderId ||
        incomingPayload.originalMerchantOrderId ||
        null;

      if (originalOrderId) {
        const origTx = await PaymentTransaction.findOne({
          where: { merchantOrderId: originalOrderId }
        });

        const bookingId = (origTx && origTx.bookingId) || refundTx.bookingId;
        if (bookingId) {
          const booking = await Booking.findByPk(bookingId);
          if (booking) await recomputeBookingTotals(booking);
        }
      }

      console.info("\x1b[32m[WEBHOOK] Refund webhook processed successfully\x1b[0m", resolvedRefundId);
      return res.status(200).json({ message: "Refund webhook processed" });
    }


    // Normal order events
    if (!merchantOrderId) {
      console.warn('[WEBHOOK] No merchantOrderId present for order event', { eventType, root });
      return res.status(200).json({ message: 'Webhook processed (no merchantOrderId)' });
    }

    const tx = await PaymentTransaction.findOne({ where: { merchantOrderId } });
    if (!tx) {
      console.warn('[WEBHOOK] No transaction found for merchantOrderId', merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (unknown transaction)' });
    }

    console.info('[WEBHOOK] Handling ORDER event', { eventType, merchantOrderId, txId: tx.id });

    if (isSuccessEvent(eventType, state)) {
      await sequelize.transaction(async (t) => {
        await tx.reload({ transaction: t, lock: t.LOCK.UPDATE });

        if (tx.webhookProcessedAt && tx.status === 'SUCCESS') {
          console.info('[WEBHOOK] Transaction already marked SUCCESS - ignoring duplicate', tx.merchantOrderId);
          return;
        }

        tx.status = 'SUCCESS';
        tx.webhookProcessedAt = new Date();
        tx.phonepeOrderId = phonepeOrderId || tx.phonepeOrderId;
        tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: root, webhookProcessed: true });

        await tx.save({ transaction: t });

        if (tx.bookingId) {
          const booking = await Booking.findByPk(tx.bookingId, { transaction: t, lock: t.LOCK.UPDATE });
          if (booking) await recomputeBookingTotals(booking, t);
          return;
        }

        if (tx.pendingBookingData) {
          const pb = tx.pendingBookingData;

          let checkIn = pb.checkInDate ? moment(pb.checkInDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD') : null;
          let checkOut = pb.checkOutDate ? moment(pb.checkOutDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD') : null;
          if (!checkIn) checkIn = moment().format('YYYY-MM-DD');
          if (!checkOut) checkOut = moment(checkIn).add(Number(pb.duration || 0), 'months').format('YYYY-MM-DD');

          const overlappingBooking = await Booking.findOne({
            where: {
              userId: tx.userId,
              status: { [Op.in]: ['approved', 'active', 'pending'] },
              [Op.or]: [
                { checkOutDate: { [Op.is]: null }, checkInDate: { [Op.lte]: checkOut } },
                { checkOutDate: { [Op.gte]: checkIn }, checkInDate: { [Op.lte]: checkOut } },
              ],
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (overlappingBooking) {
            tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { bookingSkippedDueToOverlap: true, overlapBookingId: overlappingBooking.id });
            await tx.save({ transaction: t });
            console.info('[WEBHOOK] Booking creation skipped due to overlap', { merchantOrderId: tx.merchantOrderId, overlapBookingId: overlappingBooking.id });
            return;
          }

          const bookingPayload = {
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
          };

          const booking = await Booking.create(bookingPayload, { transaction: t });
          tx.bookingId = booking.id;
          await tx.save({ transaction: t });

          await recomputeBookingTotals(booking, t);
        }
      });

      return res.status(200).json({ message: 'Webhook processed (SUCCESS)' });
    }

    if (isFailedEvent(eventType, state)) {
      if (tx.status === 'SUCCESS') {
        console.info('[WEBHOOK] Ignored FAILED webhook because tx already SUCCESS', { merchantOrderId: tx.merchantOrderId, txId: tx.id });
        return res.status(200).json({ message: 'Webhook ignored (transaction already SUCCESS)' });
      }

      tx.status = 'FAILED';
      tx.webhookProcessedAt = new Date();
      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: root, webhookProcessed: true });
      await tx.save();
      console.info('[WEBHOOK] Transaction marked FAILED', tx.merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (FAILED)' });
    }

    console.info('[WEBHOOK] Unhandled event type', eventType);
    return res.status(200).json({ message: 'Webhook processed (unhandled event)' });

  } catch (err) {
    console.error('[WEBHOOK] processing error', err);
    return res.status(500).json({ message: 'Server error processing webhook', error: err.message });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const filterType = req.query.type;
    const filterStatus = req.query.status;

    const where = { userId };
    if (filterType) where.type = filterType;
    if (filterStatus) where.status = filterStatus;

    if (q) {
      const Op = require('sequelize').Op;
      where[Op.or] = [
        { merchantOrderId: { [Op.iLike]: `%${q}%` } },
        { phonepeOrderId: { [Op.iLike]: `%${q}%` } },
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
        phonepeOrderId: r.phonepeOrderId || (r.rawResponse && r.rawResponse.phonepeCreateResponse && r.rawResponse.phonepeCreateResponse.body && r.rawResponse.phonepeCreateResponse.body.orderId) || null,
        bookingId: r.bookingId || null,
        amountPaise,
        amountRupees: Math.round(amountPaise / 100),
        type: r.type,
        status: r.status,
        redirectUrl: r.redirectUrl || null,
        rawResponse: r.rawResponse || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return res.json({
      success: true,
      page,
      limit,
      total: count,
      payments,
    });
  } catch (err) {
    console.error('[PaymentController] getUserTransactions error', err);
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
        { phonepeOrderId: { [Op.iLike]: `%${query}%` } },
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
    res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.getRefundInfo = async (req, res) => {
  try {
    const txId = req.params.transactionId;

    const tx = await PaymentTransaction.findByPk(txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

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
    res.status(500).json({ message: 'Server error' });
  }
};