const sequelize = require('../config/database');
const { Op } = require('sequelize');
const moment = require('moment');

const PaymentTransaction = require('../models/paymentTransaction');
const Booking = require('../models/bookRoom');
const BookingExtension = require('../models/bookingExtension');
const User = require('../models/user');
const Property = require('../models/property');

const {
  verifyWebhookSignature,
} = require('../utils/razorpay/razorpaySecurity');

const { logActivity } = require('../helpers/activityLogger');
const {
  refundCompletedEmail,
} = require('../utils/emailTemplates/emailTemplates');
const { mailsender } = require('../utils/emailService');
const {
  generateAndSendAcknowledgementReceipt,
} = require('../utils/acknowledgementReceiptService');

function parseRoot(req) {
  const rawBody =
    req.rawBodyString ||
    (Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : null);

  if (!rawBody) {
    throw new Error('Raw webhook body is required');
  }

  return {
    root: JSON.parse(rawBody),
    rawBody,
  };
}

function getPaymentEntity(root) {
  return root?.payload?.payment?.entity || null;
}

function getRefundEntity(root) {
  return root?.payload?.refund?.entity || null;
}

function isPaymentSuccess(root) {
  return (
    root?.event === 'payment.captured' ||
    root?.event === 'order.paid'
  );
}

function isPaymentFailure(root) {
  return root?.event === 'payment.failed';
}

function isRefundEvent(root) {
  return (
    root?.event === 'refund.created' ||
    root?.event === 'refund.processed' ||
    root?.event === 'refund.failed'
  );
}

function refundStatusFromEvent(event, refund) {
  if (
    event === 'refund.processed' ||
    refund?.status === 'processed'
  ) {
    return 'SUCCESS';
  }

  if (
    event === 'refund.failed' ||
    refund?.status === 'failed'
  ) {
    return 'FAILED';
  }

  return 'PENDING';
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
      include: [{ model: Property, as: 'property' }],
    });

    propertyName = booking?.property?.name || '-';
  }

  const email = refundCompletedEmail({
    userName: user.fullName || 'Guest',
    bookingId: refundTx.bookingId,
    propertyName,
    refundAmount: refundTx.amount / 100,
  });

  await mailsender(
    user.email,
    'Refund Completed - Coco Living',
    email.html,
    email.attachments
  );

  refundTx.rawResponse = {
    ...(refundTx.rawResponse || {}),
    refundSuccessEmailSent: true,
  };

  await refundTx.save();
}

async function sendAcknowledgementReceiptIfNeeded(tx) {
  await tx.reload();

  if (tx.rawResponse?.acknowledgementReceiptSent) return;

  try {
    await generateAndSendAcknowledgementReceipt(tx);

    tx.rawResponse = {
      ...(tx.rawResponse || {}),
      acknowledgementReceiptSent: true,
    };

    await tx.save();
  } catch (err) {
    console.error(
      '[ACK RECEIPT] Failed to send acknowledgement receipt',
      err
    );
  }
}

async function recomputeBookingTotals(booking, t = null) {
  const rows = await sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount + COALESCE("discountAmount", 0) * 100 ELSE 0 END), 0) as paid
     FROM payment_transactions
     WHERE "bookingId" = :bookingId`,
    {
      replacements: { bookingId: booking.id },
      type: sequelize.QueryTypes.SELECT,
      transaction: t,
    }
  );

  const paid = Number(rows[0]?.paid || 0);
  const totalPaise = Math.round(
    Number(booking.totalAmount || 0) * 100
  );
  const remainingPaise = Math.max(
    totalPaise - paid,
    0
  );

  booking.remainingAmount =
    Math.ceil(remainingPaise / 100);

  if (paid <= 0) {
    booking.paymentStatus = 'INITIATED';
  } else if (paid >= totalPaise) {
    booking.paymentStatus = 'COMPLETED';
  } else {
    booking.paymentStatus = 'PARTIAL';
  }

  await booking.save({ transaction: t });
}

async function handleRefund(root) {
  const refund = getRefundEntity(root);

  if (!refund || !refund.id) {
    return {
      status: 200,
      body: {
        message:
          'Refund webhook processed (no refundId)',
      },
    };
  }

  let refundTx =
    await PaymentTransaction.findOne({
      where: {
        providerRefundId: refund.id,
      },
    });

  if (
    !refundTx &&
    refund.notes?.merchantRefundId
  ) {
    refundTx =
      await PaymentTransaction.findOne({
        where: {
          merchantRefundId:
            refund.notes.merchantRefundId,
        },
      });
  }

  if (!refundTx) {
    return {
      status: 200,
      body: {
        message:
          'Refund webhook processed (unknown refund tx)',
      },
    };
  }

  refundTx.provider = 'RAZORPAY';

  refundTx.providerRefundId =
    refund.id;

  if (
    refund.payment_id &&
    !refundTx.providerPaymentId
  ) {
    refundTx.providerPaymentId =
      refund.payment_id;
  }

  refundTx.rawResponse = {
    ...(refundTx.rawResponse || {}),
    refundWebhook: root,
    refundWebhookReceivedAt:
      new Date().toISOString(),
    razorpayRefund: refund,
  };

  refundTx.webhookProcessedAt =
    new Date();

  if (
    root.event === 'refund.processed' ||
    refund.status === 'processed'
  ) {
    refundTx.status = 'SUCCESS';
  } else if (
    root.event === 'refund.failed' ||
    refund.status === 'failed'
  ) {
    refundTx.status = 'FAILED';
  } else {
    refundTx.status = 'PENDING';
  }

  const originalOrderId =
    refund.notes?.originalMerchantOrderId ||
    refundTx.originalMerchantOrderId ||
    null;

  refundTx.originalMerchantOrderId =
    originalOrderId;

  refundTx.rawResponse.originalMerchantOrderId =
    originalOrderId;

  await refundTx.save();

  if (refundTx.status === 'SUCCESS') {
    try {
      await sendRefundCompletedEmailIfNeeded(
        refundTx
      );
    } catch (err) {
      console.error(
        '[REFUND EMAIL] Failed to send refund email',
        err
      );
    }
  }

  if (originalOrderId) {
    const origTx =
      await PaymentTransaction.findOne({
        where: {
          merchantOrderId:
            originalOrderId,
        },
      });

    const bookingId =
      origTx?.bookingId ||
      refundTx.bookingId;

    if (bookingId) {
      const booking =
        await Booking.findByPk(
          bookingId
        );

      if (booking) {
        await recomputeBookingTotals(
          booking
        );
      }
    }
  }

  return {
    status: 200,
    body: {
      message:
        'Refund webhook processed',
    },
  };
}

async function createBookingFromPending(
  tx,
  t
) {
  const pb = tx.pendingBookingData;

  let checkIn = pb.checkInDate
    ? moment(
        pb.checkInDate,
        ['YYYY-MM-DD', 'DD-MM-YYYY']
      ).format('YYYY-MM-DD')
    : moment().format('YYYY-MM-DD');

  let checkOut = pb.checkOutDate
    ? moment(
        pb.checkOutDate,
        ['YYYY-MM-DD', 'DD-MM-YYYY']
      ).format('YYYY-MM-DD')
    : moment(checkIn)
        .add(
          Number(pb.duration || 0),
          'months'
        )
        .format('YYYY-MM-DD');

  const overlap =
    await Booking.findOne({
      where: {
        userId: tx.userId,
        status: {
          [Op.in]: [
            'approved',
            'active',
            'pending',
          ],
        },
        [Op.or]: [
          {
            checkOutDate: {
              [Op.is]: null,
            },
            checkInDate: {
              [Op.lte]: checkOut,
            },
          },
          {
            checkOutDate: {
              [Op.gte]: checkIn,
            },
            checkInDate: {
              [Op.lte]: checkOut,
            },
          },
        ],
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

  if (overlap) {
    tx.rawResponse = {
      ...(tx.rawResponse || {}),
      bookingSkippedDueToOverlap:
        true,
      overlapBookingId: overlap.id,
    };

    await tx.save({
      transaction: t,
    });

    return null;
  }

  const isMonthly =
    pb.paymentMode === 'MONTHLY' &&
    pb.bookingType === 'BOOK';

  const booking =
    await Booking.create(
      {
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
        remainingAmount:
          pb.totalAmount,
        bookingType: pb.bookingType,
        paymentStatus: 'INITIATED',
        status: 'pending',
        monthlyPlanSelected:
          isMonthly,
        monthlyInstallment:
          isMonthly
            ? pb.monthlyRent
            : null,
        bookingSource: 'ONLINE',
        meta: pb?.meta || null,
      },
      {
        transaction: t,
      }
    );

  tx.bookingId = booking.id;

  await tx.save({
    transaction: t,
  });

  const user =
    await User.findByPk(
      tx.userId,
      {
        transaction: t,
      }
    );

  if (booking) {
    await logActivity({
      userId: tx.userId,
      name:
        user?.fullName ||
        'System/Webhook',
      role: user.role,
      action: 'New Booking',
      entityType: 'Booking',
      entityId: booking.id,
      details: {
        property: pb.propertyId,
        roomType: pb.roomType,
        duration: pb.duration,
      },
    });
  }

  await recomputeBookingTotals(
    booking,
    t
  );

  return booking;
}

async function handleOrderSuccess(
  payment,
  tx
) {
  await sequelize.transaction(
    async (t) => {
      await tx.reload({
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (
        tx.webhookProcessedAt &&
        tx.status === 'SUCCESS'
      ) {
        return;
      }

      tx.status = 'SUCCESS';
      tx.webhookProcessedAt =
        new Date();

      tx.provider = 'RAZORPAY';
      tx.providerOrderId =
        payment.order_id ||
        tx.providerOrderId;
      tx.providerPaymentId =
        payment.id ||
        tx.providerPaymentId;

      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        webhookPayload: payment,
        webhookProcessed: true,
      };

      await tx.save({
        transaction: t,
      });

      if (tx.type === 'EXTENSION') {
        const extensionData =
          tx.pendingBookingData?.extension;

        if (!extensionData) {
          console.warn(
            '[WEBHOOK][EXTENSION] Missing extension data',
            tx.id
          );
          return;
        }

        // Idempotency guard
        const existingExtension =
          await BookingExtension.findOne({
            where: {
              paymentTransactionId:
                tx.id,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

        if (existingExtension) {
          console.info(
            '[WEBHOOK][EXTENSION] Already created, skipping',
            tx.id
          );
          return;
        }

        await BookingExtension.create(
          {
            bookingId:
              extensionData.bookingId,
            userId: tx.userId,
            requestedMonths:
              extensionData.requestedMonths,
            oldCheckOutDate:
              extensionData.oldCheckOutDate,
            newCheckOutDate:
              extensionData.newCheckOutDate,
            amountRupees:
              extensionData.amountRupees,
            status: 'pending',
            paymentTransactionId:
              tx.id,
          },
          {
            transaction: t,
          }
        );

        console.info(
          '[WEBHOOK][EXTENSION] Pending extension created',
          {
            txId: tx.id,
            bookingId:
              extensionData.bookingId,
          }
        );

        return;
      }

      if (tx.bookingId) {
        const booking =
          await Booking.findByPk(
            tx.bookingId,
            {
              transaction: t,
              lock: t.LOCK.UPDATE,
            }
          );

        if (booking) {
          if (
            tx.type ===
            'SECURITY_DEPOSIT'
          ) {
            booking.securityDepositPaid =
              true;
          }

          if (
            tx.type ===
            'MONTHLY_RENT'
          ) {
            const months =
              tx.meta?.installments ||
              1;

            booking.installmentsPaid +=
              months;
          }

          await booking.save({
            transaction: t,
          });

          await recomputeBookingTotals(
            booking,
            t
          );
        }

        return;
      }

      if (tx.pendingBookingData) {
        await createBookingFromPending(
          tx,
          t
        );
      }

      if (tx.type === 'BOOK_DEPOSIT') {
        const booking =
          await Booking.findByPk(
            tx.bookingId,
            {
              transaction: t,
              lock: t.LOCK.UPDATE,
            }
          );

        if (booking) {
          booking.securityDepositPaid =
            true;

          await booking.save({
            transaction: t,
          });
        }
      }
    }
  );
}

exports.razorpayWebhook = async (
  req,
  res
) => {
  try {
    const signature =
      req.headers[
        'x-razorpay-signature'
      ];

    if (!signature) {
      return res.status(400).json({
        message:
          'Missing Razorpay webhook signature',
      });
    }

    let parsed;

    try {
      parsed = parseRoot(req);
    } catch (err) {
      console.error(
        '[RazorpayWebhook] Invalid webhook body:',
        err
      );

      return res.status(400).json({
        message:
          err.message ===
          'Raw webhook body is required'
            ? err.message
            : 'Invalid webhook payload',
      });
    }

    if (
      !verifyWebhookSignature(
        parsed.rawBody,
        signature
      )
    ) {
      return res.status(401).json({
        message:
          'Unauthorized webhook',
      });
    }

    const root = parsed.root;

    if (!root || !root.event) {
      return res.status(400).json({
        message:
          'Invalid Razorpay webhook event',
      });
    }

    if (isRefundEvent(root)) {
      const result =
        await handleRefund(root);

      return res
        .status(result.status)
        .json(result.body);
    }

    const payment =
      getPaymentEntity(root);

    if (!payment) {
      return res.status(200).json({
        message:
          'Webhook processed (no payment entity)',
      });
    }

    const providerOrderId =
      payment.order_id || null;

    if (!providerOrderId) {
      return res.status(200).json({
        message:
          'Webhook processed (no provider order ID)',
      });
    }

    const tx =
      await PaymentTransaction.findOne({
        where: {
          providerOrderId,
        },
      });

    if (!tx) {
      return res.status(200).json({
        message:
          'Webhook processed (unknown transaction)',
      });
    }

    if (isPaymentSuccess(root)) {
      await handleOrderSuccess(
        payment,
        tx
      );

      await sendAcknowledgementReceiptIfNeeded(tx);

      return res.status(200).json({
        message:
          'Webhook processed (SUCCESS)',
      });
    }

    if (isPaymentFailure(root)) {
      if (tx.status === 'SUCCESS') {
        return res.status(200).json({
          message:
            'Webhook ignored (transaction already SUCCESS)',
        });
      }

      tx.provider = 'RAZORPAY';
      tx.providerOrderId =
        payment.order_id ||
        tx.providerOrderId;
      tx.providerPaymentId =
        payment.id ||
        tx.providerPaymentId;

      tx.status = 'FAILED';
      tx.webhookProcessedAt =
        new Date();

      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        webhookPayload: payment,
        webhookProcessed: true,
      };

      await tx.save();

      return res.status(200).json({
        message:
          'Webhook processed (FAILED)',
      });
    }

    return res.status(200).json({
      message:
        'Webhook processed (unhandled event)',
    });
  } catch (err) {
    console.error(
      '[RazorpayWebhook] Processing error:',
      err
    );

    return res.status(500).json({
      message:
        'Server error processing webhook',
      error: err.message,
    });
  }
};

module.exports = exports;