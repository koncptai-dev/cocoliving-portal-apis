const { Op } = require('sequelize');
const moment = require('moment');

const { createPayment, initiateRefund, refundStatus, createMobileOrder } = require('../utils/phonepe/phonepeApi');
const phonepeConfig = require('../utils/phonepe/phonepeConfig');
const { refundInitiatedEmail } = require('../utils/emailTemplates/emailTemplates');
const { mailsender } = require('../utils/emailService');

const User = require('../models/user');
const Booking = require('../models/bookRoom');
const Room = require('../models/rooms');
const PaymentTransaction = require('../models/paymentTransaction');
const Property = require('../models/property');
const PropertyRateCard = require('../models/propertyRateCard');
const BookingExtension = require('../models/bookingExtension');
const UserKYC = require('../models/userKYC');
const Coupon = require('../models/coupon');

const { logApiCall } = require("../helpers/auditLog");

function canonicalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '{}';

  const allowedKeys = ['rateCardId', 'checkInDate', 'duration', 'bookingType'];

  const filtered = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      filtered[key] = metadata[key];
    }
  }

  const sorted = {};
  for (const key of Object.keys(filtered).sort()) {
    sorted[key] = filtered[key];
  }

  return JSON.stringify(sorted);
}

function paiseFromRupees(rupees) {
  return Math.round(Number(rupees || 0) * 100);
}

function createMerchantOrderId(type, txId) {
  return `${type}-${txId}`;
}

async function assertUserKycVerified(userId) {
  const kyc = await UserKYC.findOne({ where: { userId } });

  if (!kyc) {
    const err = new Error('KYC not started');
    err.code = 'KYC_REQUIRED';
    throw err;
  }

  if (
    kyc.panStatus !== 'verified' ||
    kyc.ekycStatus !== 'verified'
  ) {
    const err = new Error('PAN and Aadhaar verification required');
    err.code = 'KYC_INCOMPLETE';
    throw err;
  }

  return true;
}

async function assertProfileDetailsComplete(userId) {
  const user = await User.findByPk(userId);

  if (!user) {
    const err = new Error("User not found");
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  // Parent Details
  if ((!user.parentName || !user.parentMobile || !user.parentEmail) && (user.userType == "student")) {
    const err = new Error("Parent details are mandatory before booking");
    err.code = "PROFILE_INCOMPLETE";
    throw err;
  }

  // Food Preference
  if (!user.foodPreference) {
    const err = new Error("Food preference is required before booking");
    err.code = "PROFILE_INCOMPLETE";
    throw err;
  }

  // Allergies
  if (!user.allergies || !user.allergies.trim()) {
    const err = new Error("Allergies field is required before booking");
    err.code = "PROFILE_INCOMPLETE";
    throw err;
  }

  // Studying Year (students only)
  // if (user.userType === "student" && !user.studyingYear) {
  //   const err = new Error("Studying year is required before booking");
  //   err.code = "PROFILE_INCOMPLETE";
  //   throw err;
  // }

  return true;
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
    const userId = req.user?.id;

    const isMobile = req.headers['x-client'] === 'mobile';
    if (!userId) {
      await logApiCall(req, res, 400, "Initiated booking payment - unauthorized access", "payment");
      return res.status(400).json({ success: false, message: 'Unauthorized Access' });
    }
    // await assertUserKycVerified(userId);
    await assertProfileDetailsComplete(userId);

    const { bookingType, paymentMode = 'FULL', couponCode, metadata = {} } = req.body;
    const {
      preferredFloor = null,
      preferredRoomNumber = null,
      preferredBed = null,
    } = metadata;

    if (!metadata.duration || ![6, 12].includes(Number(metadata.duration))) {
      await logApiCall(req, res, 400, "Initiated booking payment - invalid duration", "payment", userId);
      return res.status(400).json({ success: false, message: 'duration must be either 6 or 12 months only' });
    }

    if (!bookingType || !metadata) {
      await logApiCall(req, res, 400, "Initiated booking payment - missing required fields", "payment", userId);
      return res.status(400).json({ success: false, message: 'bookingType and metadata are required' });
    }

    if (!['FULL', 'MONTHLY'].includes(paymentMode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid paymentMode'
      });
    }
    if (paymentMode === 'MONTHLY' && couponCode) {
      return res.status(400).json({
        success: false,
        message: "Coupons are not allowed for monthly payment plan"
      });
    }
    const rateCard = await PropertyRateCard.findByPk(metadata.rateCardId);
    if (!rateCard) {
      await logApiCall(req, res, 400, "Initiated booking payment - invalid rateCardId", "payment", userId);
      return res.status(400).json({ success: false, message: 'Invalid rateCardId' });
    }

    const normalizedCheckIn = moment(metadata.checkInDate, ['YYYY-MM-DD', 'DD-MM-YYYY']).format('YYYY-MM-DD');
    const normalizedCheckOut = moment(normalizedCheckIn).add(Number(metadata.duration || 0), 'months').subtract(1, 'day').format('YYYY-MM-DD');

    const rebuiltMeta = {
      bookingType: bookingType.toUpperCase() === 'PREBOOK' ? 'PREBOOK' : 'BOOK',
      rateCardId: rateCard.id,
      propertyId: rateCard.propertyId,
      roomType: rateCard.roomType,
      checkInDate: normalizedCheckIn,
      checkOutDate: normalizedCheckOut,
      duration: Number(metadata.duration),
      monthlyRent: Number(rateCard.rent),
      securityDeposit: Math.round(Number(rateCard.rent) * 2),
    };


    const overlap = await checkOverlappingBooking(userId, rebuiltMeta.checkInDate, rebuiltMeta.checkOutDate);
    if (overlap) {
      await logApiCall(req, res, 400, "Initiated booking payment - overlapping booking exists", "payment", userId);
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
        const oldCanon = oldTx.pendingBookingData ? canonicalizeMetadata({
          bookingType: oldTx.pendingBookingData.bookingType,
          rateCardId: oldTx.pendingBookingData.rateCardId,
          checkInDate: oldTx.pendingBookingData.checkInDate,
          duration: oldTx.pendingBookingData.duration,
        }) : null;
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
    let rentAmount = rebuiltMeta.monthlyRent * rebuiltMeta.duration ;
    const totalAmountRupees = rentAmount + rebuiltMeta.securityDeposit;

    let baseAmountRupees;
    if (rebuiltMeta.bookingType === "PREBOOK") {
      baseAmountRupees = 5000;
    } else if (rebuiltMeta.bookingType === "BOOK") {
      if (paymentMode === 'MONTHLY') {
        baseAmountRupees = rebuiltMeta.securityDeposit;
      } else {
        baseAmountRupees = rentAmount;
      }
    }
    let discountApplied = 0;
    let appliedCoupon = null;

    if (couponCode && paymentMode !== 'MONTHLY') {

      const coupon = await Coupon.findOne({ where: { code: couponCode } });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon code"
        });
      }

      if (coupon.isDisabled || coupon.status !== "Active") {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon code"
        });
      }

      const today = moment().format("YYYY-MM-DD");

      if (today < coupon.startDate) {
        return res.status(400).json({
          success: false,
          message: "Coupon not active yet"
        });
      }

      if (today > coupon.endDate) {
        return res.status(400).json({
          success: false,
          message: "Coupon expired"
        });
      }

      if (
        coupon.shareTarget === "Specific Property" &&
        coupon.propertyId !== rebuiltMeta.propertyId
      ) {
        return res.status(400).json({
          success: false,
          message: "This coupon is not valid for this property"
        });
      }

      if (coupon.discountType === "percentage") {
        discountApplied =
          (baseAmountRupees * Number(coupon.discountValue)) / 100;
      } else {
        discountApplied = Number(coupon.discountValue);
      }

      discountApplied = Math.round(discountApplied);

      if ( rebuiltMeta.bookingType === "PREBOOK" ){
        if( discountApplied >= baseAmountRupees ){
          return res.status(400).json({
            success : false,
            message : "Discount cannot be applied ( Payable amount must be atleast ₹1 )"
          })
        }
      }
      if( rebuiltMeta.bookingType === "BOOK" ){
        if( discountApplied > baseAmountRupees ){
          return res.status(400).json({
            success : false,
            message : "Discount exceeds rent amount"
          })
        }
      }


      appliedCoupon = coupon;
    }
    let payableAmountRupees;

    if (rebuiltMeta.bookingType === "PREBOOK") {
      payableAmountRupees = baseAmountRupees - discountApplied;
    } else if (rebuiltMeta.bookingType === "BOOK" ){
      if (paymentMode === 'MONTHLY'){
        payableAmountRupees = rebuiltMeta.securityDeposit;
      } else {
        payableAmountRupees = ( rentAmount - discountApplied ) + rebuiltMeta.securityDeposit;
      }
    }
    const amountPaise = paiseFromRupees(payableAmountRupees);

    const tx = await PaymentTransaction.create({
      merchantOrderId: `tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userId,
      amount: amountPaise,
      type: rebuiltMeta.bookingType === 'PREBOOK' ? 'PREBOOK' : paymentMode === 'MONTHLY' ? 'BOOK_DEPOSIT' : 'FULL',
      status: 'PENDING',
      pendingBookingData: {
        bookingType: rebuiltMeta.bookingType,
        paymentMode,
        rateCardId: rebuiltMeta.rateCardId,
        checkInDate: rebuiltMeta.checkInDate,
        checkOutDate: rebuiltMeta.checkOutDate,
        duration: rebuiltMeta.duration,
        monthlyRent: rebuiltMeta.monthlyRent,
        securityDeposit: rebuiltMeta.securityDeposit,
        totalAmount: totalAmountRupees,
        payableAmount: payableAmountRupees,
        propertyId: rebuiltMeta.propertyId,
        roomType: rebuiltMeta.roomType,

        meta: {
          bookingPreferences: {
            preferredFloor,
            preferredRoomNumber,
            preferredBed,
          },

        }
      },
      meta: {
        coupon: appliedCoupon ? {
          code: appliedCoupon.code,
          discountType: appliedCoupon.discountType,
          discountValue: appliedCoupon.discountValue,
          discountApplied
        } : null,
      },
      rawResponse: { note: 'pending transaction created' }
    });

    let typeLower;

    if (rebuiltMeta.bookingType === 'PREBOOK') {
      typeLower = 'prebook';
    } else if (paymentMode === 'MONTHLY') {
      typeLower = 'book-deposit';
    } else {
      typeLower = 'full';
    }
    const merchantOrderId = createMerchantOrderId(typeLower, tx.id);
    tx.merchantOrderId = merchantOrderId;
    await tx.save();


    tx.rawResponse = Object.assign({}, tx.rawResponse || {}, {
      calculated: { totalAmountRupees, payableAmountRupees }
    });

    const phonepePayload = {
      merchantOrderId: tx.merchantOrderId,
      metaInfo: {
        udf1: tx.type,
        udf2: String(rebuiltMeta.rateCardId),
        udf3: String(rebuiltMeta.propertyId),
        udf4: rebuiltMeta.roomType,
        udf5: String(userId),
        udf6: isMobile ? "mobile-app" : "web-app",
        udf7: tx.merchantOrderId,
        udf8: rebuiltMeta.checkInDate,
        udf9: String(rebuiltMeta.duration)
      },
      amount: amountPaise,
      paymentFlow: isMobile
        ? { type: 'PG_CHECKOUT' }
        : {
          type: 'PG_CHECKOUT',
          message: `Coco Living - ${rebuiltMeta.roomType} Booking (Do Not Refresh)`,
          merchantUrls: {
            redirectUrl: `${phonepeConfig.REDIRECT_URL}?merchantOrderId=${merchantOrderId}`,
          },
        },
    };
    if (isMobile) {
      const mobResp = await createMobileOrder({
        merchantOrderId: tx.merchantOrderId,
        amount: amountPaise,
        userId,
      });

      tx.phonepeOrderId = mobResp.orderId || null;
      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        client: 'mobile',
        phonepeCreateResponse: mobResp,
      };
      await tx.save();

      return res.json({
        message: 'Payment initiated',
        success: true,
        merchantOrderId: tx.merchantOrderId,
        phonepe: {
          orderId: mobResp.orderId,
          token: mobResp.token,
          paymentMode: 'SDK',
        },
        transactionId: tx.id,
      });

    } else {
      const phonepeResp = await createPayment(phonepePayload);

      tx.rawResponse = Object.assign({}, tx.rawResponse || {}, {
        client: 'web',
        phonepeCreateResponse: phonepeResp,
      });

      if (phonepeResp && phonepeResp.success && phonepeResp.body) {
        tx.phonepeOrderId = phonepeResp.body.orderId || tx.phonepeOrderId || null;
        tx.redirectUrl =
          phonepeResp.body.redirectUrl ||
          phonepeResp.body.checkoutUrl ||
          tx.redirectUrl ||
          null;
      } else {
        tx.status = 'FAILED';
      }

      await tx.save();

      await logApiCall(req, res, 200, `Initiated booking payment (Transaction ID: ${tx.id}, Type: ${tx.type})`, "payment", userId);
      return res.json({
        message: 'Payment initiated',
        success: true,
        redirectUrl: tx.redirectUrl,
        transaction: tx,
      });
    }
  } catch (err) {
    if (
      err.code === 'KYC_REQUIRED' ||
      err.code === 'KYC_INCOMPLETE' ||
      err.code === 'PROFILE_INCOMPLETE' ||
      err.code === 'USER_NOT_FOUND'
    ) {
      return res.status(422).json({
        success: false,
        code: err.code,
        message: err.message
      });
    }
    console.error('[BookingPaymentController] initiate error', err);
    await logApiCall(req, res, 500, "Error occurred while initiating booking payment", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: `Failed to initiate payment: ${err.message || err}` });
  }
};

exports.initiateRemaining = async (req, res) => {
  try {
    const userId = req.user?.id;
    const isMobile = req.headers['x-client'] === 'mobile';
    const { bookingId, paymentMode } = req.body;

    if (!userId || !bookingId) {
      await logApiCall(req, res, 400, "Initiated remaining payment - bookingId required", "payment", userId);
      return res.status(400).json({ success: false, message: 'bookingId required' });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      await logApiCall(req, res, 404, `Initiated remaining payment - booking not found (ID: ${bookingId})`, "payment", userId);
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      await logApiCall(req, res, 403, `Initiated remaining payment - unauthorized booking access (ID: ${bookingId})`, "payment", userId);
      return res.status(403).json({ success: false, message: 'Unauthorized booking access' });
    }

    if (booking.status !== 'approved') {
      return res.status(422).json({ success: false, message: 'Can Only pay remaining after Booking gets Approved' })
    }

    if (booking.bookingType === 'BOOK' && booking.monthlyPlanSelected) {
      return res.status(400).json({
        success: false,
        message: 'Remaining payment is not applicable for monthly booking plan'
      });
    }
    if (paymentMode === 'MONTHLY') {

      if (booking.monthlyPlanSelected) {
        return res.status(400).json({
          success: false,
          message: 'Monthly plan already selected'
        });
      }

      booking.monthlyPlanSelected = true;
      booking.monthlyInstallment = booking.monthlyRent;
      await booking.save();

      return res.json({
        success: true,
        message: 'Monthly payment plan activated',
        monthlyInstallment: booking.monthlyInstallment
      });
    }

    const txs = await PaymentTransaction.findAll({
      where: { bookingId, status: 'SUCCESS', type: { [Op.ne]: 'REFUND' } }
    });

    const totalPaidPaise = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalAmountPaise = Math.round(Number(booking.totalAmount) * 100);
    const remainingPaise = Math.max(totalAmountPaise - totalPaidPaise, 0);

    if (remainingPaise <= 0) {
      await logApiCall(req, res, 200, `Initiated remaining payment - no remaining amount (Booking ID: ${bookingId})`, "payment", userId);
      return res.json({ success: false, message: 'No remaining amount to pay' });
    }
    const tempOrderId = `remaining-tmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const draftTx = await PaymentTransaction.create({
      userId,
      bookingId,
      amount: remainingPaise,
      type: 'REMAINING',
      status: 'PENDING',
      merchantOrderId: tempOrderId,
      rawResponse: { note: 'pending remaining transaction created' }
    });

    const finalOrderId = createMerchantOrderId('remaining', draftTx.id);
    draftTx.merchantOrderId = finalOrderId;

    await draftTx.save();


    const phonepePayload = {
      merchantOrderId: finalOrderId,
      amount: remainingPaise,
      metaInfo: {
        udf1: 'REMAINING',
        udf2: String(booking.rateCardId),
        udf3: String(booking.propertyId),
        udf4: booking.roomType,
        udf5: String(userId),
        udf6: "web-app",
        udf7: finalOrderId,
        udf8: booking.checkInDate,
        udf9: String(booking.duration)
      },
      paymentFlow: isMobile
        ? { type: 'PG_CHECKOUT' }
        : {
          type: 'PG_CHECKOUT',
          message: `Coco Living - Remaining Payment`,
          merchantUrls: {
            redirectUrl: `${phonepeConfig.REDIRECT_URL}?merchantOrderId=${finalOrderId}`,
          },
        },
    };

    if (isMobile) {
      const mobResp = await createMobileOrder({
        merchantOrderId: finalOrderId,
        amount: remainingPaise,
        userId,
      });

      draftTx.phonepeOrderId = mobResp.orderId || null;
      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'mobile',
        phonepeCreateResponse: mobResp,
      };

      await draftTx.save();

      return res.json({
        success: true,
        merchantOrderId: finalOrderId,
        phonepe: {
          orderId: mobResp.orderId,
          token: mobResp.token,
          paymentMode: 'SDK',
        },
        transactionId: draftTx.id,
      });

    } else {
      const phonepeResp = await createPayment(phonepePayload);

      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'web',
        phonepeCreateResponse: phonepeResp,
      };

      if (phonepeResp.success && phonepeResp.body) {
        draftTx.phonepeOrderId = phonepeResp.body.orderId;
        draftTx.redirectUrl =
          phonepeResp.body.redirectUrl ||
          phonepeResp.body.checkoutUrl ||
          null;
      } else {
        draftTx.status = 'FAILED';
      }

      await draftTx.save();

      await logApiCall(req, res, 200, `Initiated remaining payment (Transaction ID: ${draftTx.id}, Booking ID: ${bookingId})`, "payment", userId);
      return res.json({
        success: true,
        redirectUrl: draftTx.redirectUrl,
        transaction: draftTx,
      });
    }
  } catch (err) {
    console.error('[initiateRemaining] error', err);
    await logApiCall(req, res, 500, "Error occurred while initiating remaining payment", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.initiateSecurityDeposit = async (req, res) => {
  try {

    const userId = req.user?.id;
    const { bookingId } = req.body;
    const isMobile = req.headers['x-client'] === 'mobile';

    console.log('[SECURITY_DEPOSIT][REQ]', {
      bookingId,
      userId,
      isMobile,
      env: process.env.NODE_ENV,
    });

    const booking = await Booking.findByPk(bookingId);

    console.log('[SECURITY_DEPOSIT][BOOKING_FETCH]', {
      found: !!booking,
      fetchedBookingId: booking?.id,
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    console.log('[SECURITY_DEPOSIT][BOOKING_CORE_FIELDS]', {
      id: booking.id,
      bookingType: booking.bookingType,
      bookingTypeType: typeof booking.bookingType,
      isPrebookCheck: booking.bookingType === 'PREBOOK',
      isBookCheck: booking.bookingType === 'BOOK',
      userIdFromBooking: booking.userId,
      userIdFromReq: userId,
      contractStatus: booking.contractStatus,
      securityDepositPaid: booking.securityDepositPaid,
    });

    if (booking.userId !== userId) {
      console.log('[SECURITY_DEPOSIT][FAIL][UNAUTHORIZED]', {
        bookingUserId: booking.userId,
        requestUserId: userId,
      });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (booking.contractStatus !== 'SIGNED') {
      console.log('[SECURITY_DEPOSIT][FAIL][CONTRACT_NOT_SIGNED]', {
        contractStatus: booking.contractStatus,
      });
      return res.status(422).json({
        success: false,
        message: 'Contract must be signed before security deposit payment'
      });
    }

    if (booking.securityDepositPaid) {
      console.log('[SECURITY_DEPOSIT][FAIL][ALREADY_PAID]');
      return res.status(422).json({
        success: false,
        message: 'Security deposit already paid'
      });
    }

    // ---- DEBUG: exact failing condition ----
    if (booking.bookingType !== 'PREBOOK') {
      console.log('[SECURITY_DEPOSIT][FAIL][BOOKING_TYPE_MISMATCH]', {
        received: booking.bookingType,
        expected: 'PREBOOK',
      });

      return res.status(400).json({
        success:false,
        message: 'Security deposity can not be paid for BOOK type bookings.'
      });
    }

    const amountPaise = Math.round(booking.monthlyRent * 2 * 100);

    const draftTx = await PaymentTransaction.create({
      userId,
      bookingId,
      amount: amountPaise,
      type: 'SECURITY_DEPOSIT',
      status: 'PENDING',
      merchantOrderId: `tmp-sec-${Date.now()}`
    });

    const finalOrderId = `SECURITY-${draftTx.id}`;
    draftTx.merchantOrderId = finalOrderId;
    await draftTx.save();

    if (isMobile) {
      const mobResp = await createMobileOrder({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        userId,
      });

      draftTx.phonepeOrderId = mobResp.orderId || null;
      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'mobile',
        phonepeCreateResponse: mobResp,
      };

      await draftTx.save();

      return res.json({
        success: true,
        merchantOrderId: finalOrderId,
        phonepe: {
          orderId: mobResp.orderId,
          token: mobResp.token,
          paymentMode: 'SDK',
        },
        transactionId: draftTx.id,
      });

    } else {
      const phonepeResp = await createPayment({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: 'Security Deposit Payment',
          merchantUrls: {
            redirectUrl: `${phonepeConfig.REDIRECT_URL}?merchantOrderId=${finalOrderId}`
          }
        }
      });

      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'web',
        phonepeCreateResponse: phonepeResp,
      };

      if (phonepeResp?.success && phonepeResp?.body) {
        draftTx.phonepeOrderId = phonepeResp.body.orderId;
        draftTx.redirectUrl =
          phonepeResp.body.redirectUrl ||
          phonepeResp.body.checkoutUrl ||
          null;
      } else {
        draftTx.status = 'FAILED';
      }

      await draftTx.save();

      return res.json({
        success: true,
        redirectUrl: draftTx.redirectUrl,
        transaction: draftTx,
      });
    }
  } catch (err) {
    console.log('[SECURITY_DEPOSIT][ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.initiateMonthlyRent = async (req, res) => {
  try {

    const userId = req.user?.id;
    const { bookingId } = req.body;
    const isMobile = req.headers['x-client'] === 'mobile';

    console.log("===== INITIATE MONTHLY RENT START =====");
    console.log("userId:", userId);
    console.log("bookingId:", bookingId);
    console.log("isMobile:", isMobile);

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      console.log("Booking NOT FOUND");
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    console.log("BOOKING DATA:", {
      id: booking.id,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      monthlyInstallment: booking.monthlyInstallment,
      installmentsPaid: booking.installmentsPaid,
      monthlyPlanSelected: booking.monthlyPlanSelected,
      securityDepositPaid: booking.securityDepositPaid
    });

    if (!booking.monthlyPlanSelected) {
      console.log("Monthly plan NOT selected");
      return res.status(400).json({ success: false, message: 'Monthly plan not selected' });
    }

    if (!booking.securityDepositPaid) {
      console.log("Security deposit NOT paid");
      return res.status(422).json({
        success: false,
        message: 'Security deposit must be paid before rent payments'
      });
    }

    const property = await Property.findByPk(booking.propertyId);

    console.log("PROPERTY DATA:", {
      id: property?.id,
      lateFeePerDay: property?.lateFeePerDay
    });

    const today = moment();
    const checkInDate = moment(booking.checkInDate);

    console.log("DATE DEBUG:", {
      today: today.format("YYYY-MM-DD"),
      checkInDate: checkInDate.format("YYYY-MM-DD")
    });

    const monthsElapsed = today.year() * 12 + today.month() - (checkInDate.year() * 12 + checkInDate.month()) + 1;

    const unpaidMonths = monthsElapsed - booking.installmentsPaid;

    console.log("MONTH CALCULATION:", {
      monthsElapsed,
      installmentsPaid: booking.installmentsPaid,
      unpaidMonths
    });

    if (unpaidMonths <= 0) {
      console.log("NO UNPAID MONTHS");
      return res.json({ success: false, message: 'No pending installments' });
    }

    let payableAmount = 0;
    let installments = 0;
    let remainingMonths = unpaidMonths;

    console.log("INITIAL STATE:", {
      payableAmount,
      installments,
      remainingMonths
    });

    if (booking.installmentsPaid === 0) {
      const daysInMonth = checkInDate.daysInMonth();
      const checkInDay = checkInDate.date();
      const remainingDays = daysInMonth - checkInDay + 1;
      const dailyRent = booking.monthlyInstallment / daysInMonth;
      const proratedRent = dailyRent * remainingDays;

      console.log("FIRST MONTH PRORATION:", {
        daysInMonth,
        checkInDay,
        remainingDays,
        monthlyInstallment: booking.monthlyInstallment,
        dailyRent,
        proratedRent
      });

      payableAmount += proratedRent;
      installments += 1;
      remainingMonths -= 1;

      console.log("AFTER FIRST MONTH:", {
        payableAmount,
        installments,
        remainingMonths
      });
    }
    if (remainingMonths > 0) {
      const checkoutDate = moment(booking.checkOutDate);

      console.log("LOOP START:", {
        remainingMonths,
        checkoutDate: checkoutDate.format("YYYY-MM-DD")
      });

      for (let i = 0; i < remainingMonths; i++) {

        const monthStart = moment(checkInDate).add(booking.installmentsPaid + installments, 'months').startOf('month');

        console.log(`MONTH ITERATION ${i + 1}:`, {
          monthStart: monthStart.format("YYYY-MM-DD")
        });

        if (monthStart.isSame(checkoutDate, 'month')) {

          const daysInMonth = monthStart.daysInMonth();
          const checkoutDay = checkoutDate.date();
          const dailyRent = booking.monthlyInstallment / daysInMonth;
          const proratedLastMonth = dailyRent * checkoutDay;

          console.log("LAST MONTH PRORATION:", {
            daysInMonth,
            checkoutDay,
            dailyRent,
            proratedLastMonth
          });

          payableAmount += proratedLastMonth;

        } else {

          console.log("FULL MONTH ADDED:", booking.monthlyInstallment);
          payableAmount += booking.monthlyInstallment;
        }

        installments += 1;

        console.log("RUNNING TOTAL:", {
          payableAmount,
          installments
        });
      }
    }

    console.log("BEFORE PREBOOK ADJUSTMENT:", payableAmount);

    booking.meta = booking.meta || {};
    if (!booking.meta.prebookAdjusted) {
      const prebookTx = await PaymentTransaction.findOne({
        where: {
          bookingId,
          type: 'PREBOOK',
          status: 'SUCCESS'
        }
      });

      const prebookPaid = prebookTx ? Number(prebookTx.amount) / 100 : 0;

      console.log("PREBOOK DEBUG:", {
        prebookTx: !!prebookTx,
        prebookPaid
      });

      if (prebookPaid > 0) {
        if (payableAmount > prebookPaid) {

          payableAmount -= prebookPaid;

          console.log("PREBOOK APPLIED:", {
            deducted: prebookPaid,
            remaining: payableAmount
          });

          booking.meta.prebookAdjusted = true;
          await booking.save();

        } else {
          console.log("PREBOOK > PAYABLE (POSSIBLE ZERO CASE):", {
            payableAmount,
            prebookPaid
          });
        }
      }
    }

    console.log("AFTER PREBOOK:", payableAmount);

    // LATE FEE
    let lateFee = 0;

    console.log("---- LATE FEE DEBUG START ----");

    if (unpaidMonths > 0) {

      const lastPaidMonth = booking.installmentsPaid;
      let dueDate;

      if (lastPaidMonth === 0) {
        dueDate = moment(checkInDate);
      } else {
        dueDate = moment(checkInDate)
          .add(lastPaidMonth, 'months')
          .date(7);
      }

      if (today.isAfter(dueDate)) {
        const lateDays = today.diff(dueDate, 'days');
        lateFee = lateDays * property.lateFeePerDay;

        console.log("LATE FEE APPLIED:", {
          lateDays,
          lateFeePerDay: property.lateFeePerDay,
          lateFee
        });
      } else {
        console.log("NO LATE FEE");
      }

    }

    console.log("FINAL LATE FEE:", lateFee);
    console.log("---- LATE FEE DEBUG END ----");

    const rentAmount = payableAmount;
    const totalAmount = rentAmount + lateFee;
    const amountPaise = Math.round(totalAmount * 100);

    console.log("FINAL AMOUNT DEBUG:", {
      rentAmount,
      lateFee,
      totalAmount,
      amountPaise
    });

    if (amountPaise <= 0) {
      console.log("CRITICAL: ZERO OR NEGATIVE PAYMENT GENERATED", {
        payableAmount,
        lateFee,
        totalAmount
      });
    }

    // ---- TRANSACTION CREATION ----
    const draftTx = await PaymentTransaction.create({
      userId,
      bookingId,
      amount: amountPaise,
      type: 'MONTHLY_RENT',
      status: 'PENDING',
      merchantOrderId: `tmp-month-${Date.now()}`,
      meta: {
        installments,
        unpaidMonths,
        lateFee
      }
    });

    console.log("TRANSACTION CREATED:", draftTx.id);

    const finalOrderId = `MONTHLY-${draftTx.id}`;
    draftTx.merchantOrderId = finalOrderId;
    await draftTx.save();

    console.log("FINAL ORDER ID:", finalOrderId);

    console.log("===== INITIATE MONTHLY RENT END =====");

    if (isMobile) {
      const mobResp = await createMobileOrder({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        userId,
      });

      draftTx.phonepeOrderId = mobResp.orderId || null;
      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'mobile',
        phonepeCreateResponse: mobResp,
      };

      await draftTx.save();

      return res.json({
        success: true,
        merchantOrderId: finalOrderId,
        phonepe: {
          orderId: mobResp.orderId,
          token: mobResp.token,
          paymentMode: 'SDK',
        },
        transactionId: draftTx.id,
      });

    } else {
      const phonepeResp = await createPayment({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: 'Monthly Rent Payment',
          merchantUrls: {
            redirectUrl: `${phonepeConfig.REDIRECT_URL}?merchantOrderId=${finalOrderId}`
          }
        }
      });

      draftTx.rawResponse = {
        ...(draftTx.rawResponse || {}),
        client: 'web',
        phonepeCreateResponse: phonepeResp,
      };

      if (phonepeResp?.success && phonepeResp?.body) {
        draftTx.phonepeOrderId = phonepeResp.body.orderId;
        draftTx.redirectUrl =
          phonepeResp.body.redirectUrl ||
          phonepeResp.body.checkoutUrl ||
          null;
      } else {
        draftTx.status = 'FAILED';
      }

      await draftTx.save();

      return res.json({
        success: true,
        redirectUrl: draftTx.redirectUrl,
        transaction: draftTx,
      });
    }

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.initiateExtension = async (req, res) => {
  try {
    const { bookingId, months } = req.body;
    const userId = req.user?.id;
    const isMobile = req.headers['x-client'] === 'mobile';

    if (!bookingId || !months || ![6, 12].includes(Number(months))) {
      return res.status(400).json({ success: false, message: 'bookingId and valid months required(Extension duration must be either 6 or 12 months only)' });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!['approved', 'active'].includes(booking.status)) {
      return res.status(422).json({ success: false, message: 'Booking not extendable' });
    }

    if (moment().isAfter(moment(booking.checkOutDate))) {
      return res.status(422).json({ success: false, message: 'Cannot extend after checkout date' });
    }

    const existingPendingExtension = await BookingExtension.findOne({
      where: {
        bookingId: booking.id,
        status: 'pending'
      }
    });

    if (existingPendingExtension) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending extension request for this booking'
      });
    }
    const newCheckOutDate = moment(booking.checkOutDate)
      .add(months, 'months')
      .format('YYYY-MM-DD');

    if (booking.roomId) {
      const room = await Room.findByPk(booking.roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      const overlappingBookings = await Booking.count({
        where: {
          roomId: booking.roomId,
          id: { [Op.ne]: booking.id },
          status: ['approved', 'active'],
          checkInDate: { [Op.lt]: newCheckOutDate },
          checkOutDate: { [Op.gt]: booking.checkOutDate },
        },
      });

      const totalOccupancy = overlappingBookings + 1;

      if (totalOccupancy > room.capacity) {
        return res.status(409).json({ success: false, message: 'Room already booked for this period' });
      }
    }

    const amountRupees = booking.monthlyRent * months;
    const amountPaise = Math.round(amountRupees * 100);

    const tx = await PaymentTransaction.create({
      userId,
      bookingId,
      amount: amountPaise,
      type: 'EXTENSION',
      status: 'PENDING',
      merchantOrderId: `tmp-ext-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      pendingBookingData: {
        extension: {
          bookingId: booking.id,
          requestedMonths: months,
          oldCheckOutDate: booking.checkOutDate,
          newCheckOutDate,
          amountRupees
        }
      },
      rawResponse: { note: 'extension payment initiated' },
    });

    const finalOrderId = `EXTENSION-${tx.id}`;
    tx.merchantOrderId = finalOrderId;
    await tx.save();

    if (isMobile) {
      const mobResp = await createMobileOrder({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        userId,
      });

      tx.phonepeOrderId = mobResp.orderId || null;
      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        client: 'mobile',
        phonepeCreateResponse: mobResp,
      };

      await tx.save();

      return res.json({
        success: true,
        merchantOrderId: finalOrderId,
        phonepe: {
          orderId: mobResp.orderId,
          token: mobResp.token,
          paymentMode: 'SDK',
        },
        transactionId: tx.id,
      });

    } else {
      const phonepeResp = await createPayment({
        merchantOrderId: finalOrderId,
        amount: amountPaise,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: 'Coco Living - Booking Extension',
          merchantUrls: {
            redirectUrl: `${phonepeConfig.REDIRECT_URL}?merchantOrderId=${finalOrderId}`,
          },
        },
      });

      tx.rawResponse = {
        ...(tx.rawResponse || {}),
        client: 'web',
        phonepeCreateResponse: phonepeResp,
      };

      if (phonepeResp?.success && phonepeResp?.body) {
        tx.phonepeOrderId = phonepeResp.body.orderId;
        tx.redirectUrl =
          phonepeResp.body.redirectUrl ||
          phonepeResp.body.checkoutUrl ||
          null;
      } else {
        tx.status = 'FAILED';
      }

      await tx.save();

      return res.json({
        success: true,
        redirectUrl: tx.redirectUrl,
        transaction: tx,
      });
    }

  } catch (err) {
    console.error('[initiateExtension]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.initiateRefund = async (req, res) => {
  try {
    const actorId = req.user?.id;
    const { transactionId, amountRupees, reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Refund reason is required ( minimum 5 characters)' });
    }
    if (!transactionId || typeof amountRupees === 'undefined') {
      await logApiCall(req, res, 400, "Initiated refund - transactionId and amountRupees required", "payment", actorId);
      return res.status(400).json({ success: false, message: 'transactionId and amountRupees are required' });
    }

    const originalTx = await PaymentTransaction.findByPk(transactionId);
    if (!originalTx) {
      await logApiCall(req, res, 404, `Initiated refund - transaction not found (ID: ${transactionId})`, "payment", actorId);
      return res.status(404).json({ success: false, message: 'Original transaction not found' });
    }

    if (originalTx.status !== 'SUCCESS' || String(originalTx.type || '').toUpperCase() === 'REFUND') {
      await logApiCall(req, res, 400, `Initiated refund - transaction cannot be refunded (ID: ${transactionId})`, "payment", actorId);
      return res.status(400).json({ success: false, message: 'Only successful non-refund transactions can be refunded' });
    }

    const allRefundTxs = await PaymentTransaction.findAll({
      where: {
        type: 'REFUND',
        originalMerchantOrderId: originalTx.merchantOrderId
      },
      order: [['createdAt', 'ASC']],
    });

    const origMerchantOrderId = originalTx.merchantOrderId;
    let refundedPaiseSoFar = 0;
    for (const r of allRefundTxs) {
      const rr = r.rawResponse || {};
      if (rr && (rr.originalMerchantOrderId === origMerchantOrderId || (rr.phonepeRefundResponse && rr.phonepeRefundResponse.body && rr.phonepeRefundResponse.body.originalMerchantOrderId === origMerchantOrderId))) {
        if (r.status === 'SUCCESS') refundedPaiseSoFar += Number(r.amount || 0);
      }
    }

    const originalAmountPaise = Number(originalTx.amount || 0);
    const refundablePaise = Math.max(originalAmountPaise - refundedPaiseSoFar, 0);

    const reqAmountPaise = Math.round(Number(amountRupees || 0) * 100);

    if (reqAmountPaise <= 0) {
      await logApiCall(req, res, 400, `Initiated refund - invalid refund amount (Transaction ID: ${transactionId})`, "payment", actorId);
      return res.status(400).json({ success: false, message: 'Invalid refund amount' });
    }
    if (reqAmountPaise < 100) {
      await logApiCall(req, res, 400, `Initiated refund - amount below minimum (Transaction ID: ${transactionId})`, "payment", actorId);
      return res.status(400).json({ success: false, message: 'Minimum refund is ₹1 (100 paise) per PhonePe rules' });
    }
    if (reqAmountPaise > refundablePaise) {
      await logApiCall(req, res, 400, `Initiated refund - amount exceeds refundable (Transaction ID: ${transactionId})`, "payment", actorId);
      return res.status(400).json({ success: false, message: `Refund amount exceeds refundable amount (max refundable: ₹${(refundablePaise / 100).toFixed(2)})` });
    }

    const tempMerchantRefundId = `REFUND-TMP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const draftRefund = await PaymentTransaction.create({
      userId: originalTx.userId || actorId,
      bookingId: originalTx.bookingId || null,
      amount: reqAmountPaise,
      type: 'REFUND',
      status: 'PENDING',
      merchantOrderId: tempMerchantRefundId,
      merchantRefundId: null,
      refundReason: reason.trim(),
      rawResponse: {
        note: 'created refund draft',
        originalMerchantOrderId: origMerchantOrderId,
        refundReason: reason.trim()
      },
    });

    const finalMerchantRefundId = `REFUND-${draftRefund.id}`;

    draftRefund.merchantRefundId = finalMerchantRefundId;
    draftRefund.merchantOrderId = finalMerchantRefundId;
    draftRefund.originalMerchantOrderId = origMerchantOrderId;
    draftRefund.rawResponse = Object.assign({}, draftRefund.rawResponse || {}, { originalMerchantOrderId: origMerchantOrderId, merchantRefundId: finalMerchantRefundId });
    await draftRefund.save();

    const refundPayload = {
      merchantRefundId: finalMerchantRefundId,
      originalMerchantOrderId: origMerchantOrderId,
      amount: reqAmountPaise,
    };

    const phonepeResp = await initiateRefund(refundPayload);

    draftRefund.rawResponse = Object.assign({}, draftRefund.rawResponse || {}, { phonepeRefundResponse: phonepeResp, merchantRefundId: finalMerchantRefundId });

    draftRefund.status = 'PENDING';

    await draftRefund.save();

    const user = await User.findByPk(originalTx.userId);
    let propertyName = '-';

    if (originalTx.bookingId) {
      const booking = await Booking.findByPk(originalTx.bookingId);
      if (booking?.propertyId) {
        const property = await Property.findByPk(booking.propertyId);
        propertyName = property?.name || '-';
      }
    }

    const email = refundInitiatedEmail({
      userName: user.fullName || 'Guest',
      bookingId: originalTx.bookingId,
      propertyName,
      refundAmount: amountRupees,
      reason: reason.trim()
    });

    await mailsender(
      user.email,
      'Refund Initiated - Coco Living',
      email.html,
      email.attachments
    );

    await logApiCall(req, res, 200, `Initiated refund (Refund ID: ${draftRefund.id}, Transaction ID: ${transactionId}, Amount: ₹${amountRupees})`, "payment", actorId);
    return res.json({ success: true, message: 'Refund initiated', refundTransaction: draftRefund });

  } catch (err) {
    console.error('[refund] error', err);
    await logApiCall(req, res, 500, "Error occurred while initiating refund", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

exports.getRefundStatus = async (req, res) => {
  try {
    const { merchantRefundId } = req.params;

    const tx = await PaymentTransaction.findOne({ where: { merchantRefundId: merchantRefundId, type: 'REFUND' } });
    if (!tx) {
      await logApiCall(req, res, 404, `Viewed refund status - refund transaction not found (ID: ${merchantRefundId})`, "payment", req.user?.id || 0);
      return res.status(404).json({ success: false, message: 'Refund transaction not found' });
    }

    const phonepeResp = await refundStatus(merchantRefundId);

    const state = (phonepeResp?.body?.state || '').toUpperCase();

    if (state === 'COMPLETED' || state === 'CONFIRMED') {
      tx.status = 'SUCCESS';
    } else if (state === 'FAILED') {
      tx.status = 'FAILED';
    } else {
      tx.status = 'PENDING';
    }

    tx.rawResponse = { ...tx.rawResponse, refundStatusResponse: phonepeResp };
    await tx.save();

    await logApiCall(req, res, 200, `Viewed refund status (ID: ${merchantRefundId}, Status: ${tx.status})`, "payment", req.user?.id || 0);
    return res.json({ success: true, transaction: tx, phonepe: phonepeResp });
  } catch (err) {
    console.error('[refundStatus] error', err);
    await logApiCall(req, res, 500, "Error occurred while fetching refund status", "payment", req.user?.id || 0);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.getBookingPaymentSummary = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    if (!bookingId) {
      await logApiCall(req, res, 400, "Viewed booking payment summary - bookingId required", "payment", req.user?.id || 0);
      return res.status(400).json({ success: false, message: 'bookingId param is required' });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      await logApiCall(req, res, 404, `Viewed booking payment summary - booking not found (ID: ${bookingId})`, "payment", req.user?.id || 0);
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const PaymentTransactionModel = require('../models/paymentTransaction');
    const transactions = await PaymentTransactionModel.findAll({
      where: { bookingId: booking.id },
      order: [['createdAt', 'ASC']],
    });

    const totalPaidPaise = transactions
      .filter(t => t.status === 'SUCCESS' && t.type !== 'REFUND')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const netPaidPaise = totalPaidPaise;
    const totalRefundedPaise = transactions
      .filter(t => t.status === 'SUCCESS' && t.type === 'REFUND')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const totalRefundedRupees = Math.round(totalRefundedPaise / 100);

    let totalAmountRupees = Number(booking.totalAmount || 0);
    if (!totalAmountRupees) {
      for (const t of transactions) {
        if (t.pendingBookingData?.totalAmount) {
          totalAmountRupees = Number(t.pendingBookingData.totalAmount);
          break;
        }
      }
    }

    const totalAmountPaise = Math.round(totalAmountRupees * 100);

    const remainingPaise = Math.max(totalAmountPaise - netPaidPaise, 0);

    const mappedTransactions = transactions.map(t => ({
      ...t.toJSON(),
      amountRupees: Math.round(Number(t.amount || 0) / 100),
      refundReason: t.refundReason || null,
    }));

    return res.json({
      booking,
      bookingType: booking.bookingType,
      paymentStatus: booking.paymentStatus,
      paymentPlan: {
        monthlyPlanSelected: booking.monthlyPlanSelected,
        monthlyInstallment: booking.monthlyInstallment,
        installmentsPaid: booking.installmentsPaid,
        securityDepositPaid: booking.securityDepositPaid
      },
      totals: {
        totalAmountRupees,
        totalPaidRupees: Math.round(totalPaidPaise / 100),
        remainingRupees: Math.round(remainingPaise / 100),
        totalRefundedRupees
      },
      transactions: mappedTransactions,
    });
  } catch (err) {
    console.error('[BookingPaymentController] getBookingPaymentSummary error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
