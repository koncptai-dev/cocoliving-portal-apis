const crypto = require('crypto');
const PaymentTransaction = require('../models/paymentTransaction');
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


async function recomputeBookingTotals(booking, t = null) {
  if (!booking) return null;
  const replacements = { bookingId: booking.id };

  const paidResult = await sequelize.query(
    `SELECT COALESCE(SUM(amount),0) as total_paid_paise FROM payment_transactions WHERE "bookingId" = :bookingId AND status = 'SUCCESS' AND type != 'REFUND'`,
    { replacements, transaction: t, type: sequelize.QueryTypes.SELECT }
  );

  const totalPaidPaise = Number((paidResult && paidResult[0] && paidResult[0].total_paid_paise) || 0);
  const netPaidPaise = totalPaidPaise;
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
    if (!merchantOrderId) return res.status(400).json({ message: 'merchantOrderId required' });

    const phonepeResp = await getOrderStatus(merchantOrderId);

    const tx = await PaymentTransaction.findOne({ where: { merchantOrderId } });
    if (tx) {
      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { orderStatusCheck: phonepeResp });
      const mappedState = (phonepeResp && phonepeResp.body && (phonepeResp.body.state || phonepeResp.body.status || phonepeResp.body.transactionStatus)) || '';
      const stateUpper = String(mappedState).toUpperCase();

      if (stateUpper.includes('SUCCESS') || stateUpper === 'COMPLETED') tx.status = 'SUCCESS';
      else if (stateUpper.includes('FAILED') || stateUpper === 'FAILED' || stateUpper === 'DECLINED') tx.status = 'FAILED';

      await tx.save();

      if (tx.bookingId) {
        const booking = await Booking.findByPk(tx.bookingId);
        if (booking) await recomputeBookingTotals(booking);
      }
    }

    return res.status(200).json({ phonepe: phonepeResp, transaction: tx || null });
  } catch (err) {
    console.error('[PaymentController] checkOrderStatus error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.phonePeWebhook = async (req, res) => {
  try {
    let authHeader = (req.headers['authorization'] || req.headers['Authorization'] || '').trim();
    if (!authHeader) {
      console.warn('[WEBHOOK] Missing Authorization header');
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }
    let receivedHex = '';
    if (authHeader.toLowerCase().startsWith('sha256 ')) {
      receivedHex = authHeader.slice(7).trim().toLowerCase();
    } else {
      receivedHex = authHeader.trim().toLowerCase();
    }

    const expectedHex = computeExpectedWebhookHex();
    if (!receivedHex || receivedHex !== expectedHex) {
      console.warn('[WEBHOOK] Authorization mismatch', { receivedHex, expectedHex });
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }

    const payload = parsePayload(req);

    const eventType =
      payload.eventType ||
      payload.event ||
      payload.type ||
      (payload.data && payload.data.eventType) ||
      (payload.data && payload.data.type) ||
      '';

    const merchantOrderId =
      payload.merchantOrderId ||
      payload.orderId ||
      (payload.data && (payload.data.merchantOrderId || payload.data.orderId)) ||
      null;

    if (!merchantOrderId) {
      console.warn('[WEBHOOK] merchantOrderId not found in payload; ignoring');
      return res.status(200).json({ message: 'Webhook processed (no merchantOrderId)' });
    }

    const tx = await PaymentTransaction.findOne({ where: { merchantOrderId } });
    if (!tx) {
      console.warn('[WEBHOOK] No transaction found for merchantOrderId', merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (no matching transaction)' });
    }

    console.info('[WEBHOOK] Handling event', { eventType, merchantOrderId, txId: tx.id });

    const evtLower = String(eventType || '').toLowerCase();
    const mappedStatus =
      evtLower.includes('checkout.order.completed') || evtLower.includes('completed') && evtLower.includes('checkout.order')
        ? 'SUCCESS'
        : (evtLower.includes('checkout.order.failed') ? 'FAILED' : null);

    if (tx.status === 'SUCCESS' && mappedStatus === 'FAILED') {
      console.info('[WEBHOOK] Ignored FAILED webhook because tx already SUCCESS', { merchantOrderId, txId: tx.id });
      return res.status(200).json({ message: 'Webhook ignored (transaction already SUCCESS)' });
    }

    const alreadyProcessed = tx.webhookProcessedAt || (tx.rawResponse && tx.rawResponse.webhookProcessed);
    if (alreadyProcessed && mappedStatus && tx.status === mappedStatus) {
      console.info('[WEBHOOK] Already processed, no-op', { merchantOrderId, txId: tx.id });
      return res.status(200).json({ message: 'Webhook already processed' });
    }

    if (evtLower.includes('checkout.order.completed') || evtLower === 'checkout.order.completed') {
      await sequelize.transaction(async (t) => {
        await tx.reload({ transaction: t, lock: t.LOCK.UPDATE });

        if (tx.status === 'SUCCESS' && (tx.webhookProcessedAt || (tx.rawResponse && tx.rawResponse.webhookProcessed))) {
          console.info('[WEBHOOK] Transaction already SUCCESS and processed; no-op', tx.merchantOrderId);
          return;
        }

        tx.status = 'SUCCESS';
        tx.phonepeOrderId = payload.orderId || (payload.data && payload.data.orderId) || tx.phonepeOrderId;
        tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: payload, webhookProcessed: true });
        tx.webhookProcessedAt = new Date();
        await tx.save({ transaction: t });

        if (tx.bookingId) {
          const booking = await Booking.findByPk(tx.bookingId, { transaction: t, lock: t.LOCK.UPDATE });
          if (booking) {
            await recomputeBookingTotals(booking, t);
          }
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
            meta: pb,
          };

          const createdBooking = await Booking.create(bookingPayload, { transaction: t });
          tx.bookingId = createdBooking.id;
          await tx.save({ transaction: t });

          await recomputeBookingTotals(createdBooking, t);

          console.info('[WEBHOOK] Booking created from webhook', { bookingId: createdBooking.id, merchantOrderId: tx.merchantOrderId });
        }
      });

      return res.status(200).json({ message: 'Webhook processed (SUCCESS)' });
    }

    if (evtLower.includes('checkout.order.failed') || evtLower === 'checkout.order.failed') {
      if (tx.status === 'SUCCESS') {
        console.info('[WEBHOOK] Ignored FAILED webhook because tx already SUCCESS', { merchantOrderId: tx.merchantOrderId, txId: tx.id });
        return res.status(200).json({ message: 'Webhook ignored (transaction already SUCCESS)' });
      }

      tx.status = 'FAILED';
      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: payload, webhookProcessed: true });
      tx.webhookProcessedAt = new Date();
      await tx.save();
      console.info('[WEBHOOK] Transaction marked FAILED', tx.merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (FAILED)' });
    }

    if (
      evtLower.includes('pg.refund.completed') ||
      evtLower.includes('pg.refund.failed')
    ) {
      console.info('[WEBHOOK] Ignoring refund event');
      return res.status(200).json({ message: 'Webhook ignored (refunds disabled)' });
    }


    console.info('[WEBHOOK] Unhandled event type', eventType);
    return res.status(200).json({ message: 'Webhook processed (unhandled event)' });
  } catch (err) {
    console.error('[WEBHOOK] processing error', err);
    return res.status(500).json({ message: 'Server error processing webhook', error: err.message });
  }
};