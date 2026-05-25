const { Sequelize, Op } = require('sequelize');

const PaymentTransaction = require('../models/paymentTransaction');
const Booking = require('../models/bookRoom');
const { notifyElectricityUnblocked } = require('../utils/notificationService');
const { Property } = require('../models');

exports.webhook = async (req, res) => {
  try {
    const payload = req.body;

    const rechargeId = payload?.rechargeId;
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

    const transaction = await PaymentTransaction.findOne({
      where: {
        type: 'ELECTRICITY_RECHARGE',
        [Op.and]: Sequelize.literal(
          `"PaymentTransaction"."meta"->>'rechargeId' = '${rechargeId}'`
        ),
      },
      order: [['createdAt', 'DESC']],
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    const normalizedStatus = String(payload?.status || '').toUpperCase();

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
        transactionStatus = 'SUCCESS';
        break;

      case 'FAILED':
      case 'FAILURE':
        transactionStatus = 'FAILED';
        break;

      default:
        transactionStatus = 'PENDING';
    }

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

    await transaction.save();

    if (transactionStatus === 'SUCCESS') {
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
      const oldBalance =
        Number(payload?.roomBalance || 0) -
        Number(payload?.balanceAdded || 0);

      const newBalance = Number(
        payload?.roomBalance || 0
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

      const minimumBalance = booking?.property?.minimumBalance || 0;
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found',
        });
      }


      console.log({
        oldBalance,
        newBalance,
        minimumBalance,
      });
      if (
        oldBalance < minimumBalance &&
        newBalance >= minimumBalance
      ) {
        console.log(
          '✅ Meter unblocked notification'
        );

        await notifyElectricityUnblocked(
          booking
        );
      }
    }

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
