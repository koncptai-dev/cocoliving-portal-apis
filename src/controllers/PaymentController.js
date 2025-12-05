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
    let receivedHex = authHeader.toLowerCase().startsWith('sha256 ')
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (!verifyWebhookAuth(receivedHex)) {
      console.warn('[WEBHOOK] Authorization mismatch', { receivedHex });
      return res.status(401).json({ message: 'Unauthorized webhook' });
    }
    const root = parsePayload(req);
    const eventType = root.event || '';
    const incomingPayload = root.payload || {};
    const state = (incomingPayload.state || '').toUpperCase();
    const merchantOrderId = incomingPayload.merchantOrderId || null;
    const phonepeOrderId = incomingPayload.orderId || null;
    if (!merchantOrderId) {
      console.warn('[WEBHOOK] merchantOrderId not found in payload; ignoring', { eventType, root });
      return res.status(200).json({ message: 'Webhook processed (no merchantOrderId)' });
    }

    const tx = await PaymentTransaction.findOne({ where: { merchantOrderId } });
    if (!tx) {
      console.warn('[WEBHOOK] No transaction found for merchantOrderId', merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (no matching transaction)' });
    }

    console.info('[WEBHOOK] Handling event', { eventType, merchantOrderId, txId: tx.id });

    if (isSuccessEvent(eventType, state)) {
      await sequelize.transaction(async (t) => {
        await tx.reload({ transaction: t, lock: t.LOCK.UPDATE });

        if (tx.webhookProcessedAt && tx.status === 'SUCCESS') {
          console.info('[WEBHOOK] Transaction already SUCCESS and processed; no-op', tx.merchantOrderId);
          return;
        }

        tx.status = 'SUCCESS';
        tx.phonepeOrderId = phonepeOrderId || tx.phonepeOrderId;
        tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: root, webhookProcessed: true });
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
                  checkOutDate: { [Op.is]: null }, checkInDate: { [Op.lte]: checkOut } },
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

    if (isFailedEvent(eventType, state)) {
      if (tx.status === 'SUCCESS') {
        console.info('[WEBHOOK] Ignored FAILED webhook because tx already SUCCESS', { merchantOrderId: tx.merchantOrderId, txId: tx.id });
        return res.status(200).json({ message: 'Webhook ignored (transaction already SUCCESS)' });
      }

      tx.status = 'FAILED';
      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, { webhookPayload: root, webhookProcessed: true });
      tx.webhookProcessedAt = new Date();
      await tx.save();
      console.info('[WEBHOOK] Transaction marked FAILED', tx.merchantOrderId);
      return res.status(200).json({ message: 'Webhook processed (FAILED)' });
    }

    if (eventType === 'pg.refund.completed' || eventType === 'pg.refund.failed') {
      console.info('[WEBHOOK] Ignoring refund event :', eventType);
      return res.status(200).json({ message: 'Webhook ignored (refunds disabled)' });
    }


    console.info('[WEBHOOK] Unhandled event type', eventType);
    return res.status(200).json({ message: 'Webhook processed (unhandled event)' });
  } catch (err) {
    console.error('[WEBHOOK] processing error', err);
    return res.status(500).json({ message: 'Server error processing webhook', error: err.message });
  }
};