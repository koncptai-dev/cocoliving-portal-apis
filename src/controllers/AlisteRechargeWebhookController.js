const { Sequelize, Op } = require('sequelize');

const PaymentTransaction = require('../models/paymentTransaction');
const Booking = require('../models/bookRoom');
const { notifyElectricityUnblocked } = require('../utils/notificationService');
const { Property } = require('../models');

exports.webhook = async (req, res) => {
  try {
    const payload = req.body;

    console.log(
      '\n========== ALISTE RECHARGE WEBHOOK =========='
    );

    console.log(
      'FULL PAYLOAD:',
      JSON.stringify(payload, null, 2)
    );
    const rechargeId = payload?.rechargeId;
    console.log(
      'RECHARGE ID:',
      rechargeId
    );
    console.log(
      'ALISTE WEBHOOK HEADERS:',
      JSON.stringify(req.headers, null, 2)
    );
    if (!rechargeId) {
      return res.status(400).json({
        success: false,
        message: 'Recharge ID missing',
      });
    }
    console.log(
  'SEARCHING TRANSACTION USING rechargeId'
);
    const transaction = await PaymentTransaction.findOne({
      where: {
        type: 'ELECTRICITY_RECHARGE',
        [Op.and]: Sequelize.literal(
          `"PaymentTransaction"."meta"->>'rechargeId' = '${rechargeId}'`
        ),
      },
      order: [['createdAt', 'DESC']],
    });
    console.log(
  'FOUND TRANSACTION:',
  JSON.stringify(transaction, null, 2)
);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    const normalizedStatus = String(payload?.status || '').toUpperCase();
    console.log(
  'INCOMING STATUS:',
  payload?.status
);

console.log(
  'NORMALIZED STATUS:',
  normalizedStatus
);
    // idempotency
    if (
      transaction.status === 'SUCCESS'
    ) {
      return res.status(200).json({
        success: true,
        message: 'Already processed',
      });
    }

    let transactionStatus = 'PENDING';

    switch (normalizedStatus) {
      case 'SUCCESS':
      case 'PAID':
        transactionStatus = 'SUCCESS';
        break;

      case 'FAILED':
      case 'FAILURE':
        transactionStatus = 'FAILED';
        break;

      default:
        transactionStatus = 'PENDING';
    }
    console.log(
  'FINAL TRANSACTION STATUS:',
  transactionStatus
);
    transaction.status = transactionStatus;

    transaction.meta = {
      ...transaction.meta,
      webhookReceivedAt: new Date(),
      balanceAdded: payload?.balanceAdded,
      roomBalance: payload?.roomBalance,
      gatewayCharge: payload?.gatewayCharge,
      paymentMode: payload?.paymentMode,
      rechargedAt: payload?.rechargedAt,
      alisteRoomId: payload?.metaData?.alisteRoomId,
      alisteUserId: payload?.metaData?.alisteUserId,
    };

    transaction.rawResponse = payload;
    console.log(
  'TRANSACTION BEFORE SAVE:',
  JSON.stringify(
    {
      id: transaction.id,
      status: transaction.status,
      meta: transaction.meta,
    },
    null,
    2
  )
);
    await transaction.save();
console.log(
  '✅ TRANSACTION SAVED'
);
    if (transactionStatus === 'SUCCESS') {
      console.log(
  'UPDATING BOOKING firstElectricityRechargeDone'
);

console.log(
  'BOOKING ID:',
  transaction.bookingId
);
      const bookingUpdateResult =
  await Booking.update(
        {
          firstElectricityRechargeDone: true,
        },
        {
          where: {
            id: transaction.bookingId,
          },
        }
      );
      console.log(
  'BOOKING UPDATE RESULT:',
  bookingUpdateResult
);
      const oldBalance =
        Number(payload?.roomBalance || 0) -
        Number(payload?.balanceAdded || 0);

      const newBalance = Number(
        payload?.roomBalance || 0
      );
      console.log(
  'FETCHING BOOKING WITH PROPERTY'
);
      const booking = await Booking.findOne({
        where: {
          id: transaction.bookingId,
        },
        include: [
          {
            model: Property,
            as: 'property',
          },
        ],
      });
      console.log(
  'FULL BOOKING:',
  JSON.stringify(booking, null, 2)
);
      const minimumBalance = booking?.property?.minimumBalance || 0;
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found',
        });
      }


      console.log(
  '\n========== BALANCE CHECK =========='
);

console.log({
  oldBalance,
  newBalance,
  minimumBalance,
  shouldUnblock:
    oldBalance < minimumBalance &&
    newBalance >= minimumBalance,
});
      if (
        oldBalance < minimumBalance &&
        newBalance >= minimumBalance
      ) {
        console.log(
          '✅ Meter unblocked notification'
        );
        console.log(
  'TRIGGERING notifyElectricityUnblocked'
);
        await notifyElectricityUnblocked(
          booking
        );
        console.log(
  '✅ notifyElectricityUnblocked completed'
);
      }
    }
    console.log(
  '✅ notifyElectricityUnblocked completed'
);
    return res.status(200).json({
      success: true,
      message: 'Recharge webhook processed successfully',
    });
  } catch (error) {
    console.error('Recharge Webhook Error:', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
