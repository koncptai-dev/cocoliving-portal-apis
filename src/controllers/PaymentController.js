const PaymentTransaction = require('../models/paymentTransaction');
const User = require('../models/user');
const { getOrderStatus } = require('../utils/phonepe/phonepeApi');
const { Op } = require('sequelize');
const { logApiCall } = require("../helpers/auditLog");

exports.checkOrderStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;
    if (!merchantOrderId) {
      await logApiCall(req, res, 400, "Checked order status - merchantOrderId required", "payment");
      return res.status(400).json({ message: "merchantOrderId required" });
    }

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

    await logApiCall(req, res, 200, `Checked order status: ${merchantOrderId} (Status: ${derivedStatus})`, "payment");
    return res.status(200).json({
      status: derivedStatus,
      phonepe: phonepeResp,
      transaction: tx || null,
    });
  } catch (err) {
    console.error("[PaymentController] checkOrderStatus error", err);
    await logApiCall(req, res, 500, "Error occurred while checking order status", "payment");
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      await logApiCall(req, res, 401, "Viewed user transactions - unauthorized", "payment");
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

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

    await logApiCall(req, res, 200, `Viewed user transactions (${count} total)`, "payment", userId);
    return res.json({
      success: true,
      page,
      limit,
      total: count,
      payments,
    });
  } catch (err) {
    console.error('[PaymentController] getUserTransactions error', err);
    await logApiCall(req, res, 500, "Error occurred while fetching user transactions", "payment", req.user?.id || 0);
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

    await logApiCall(req, res, 200, `Viewed all transactions (${count} total)`, "payment");
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
    await logApiCall(req, res, 500, "Error occurred while fetching all transactions", "payment");
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getRefundInfo = async (req, res) => {
  try {
    const txId = req.params.transactionId;

    const tx = await PaymentTransaction.findByPk(txId);
    if (!tx) {
      await logApiCall(req, res, 404, `Viewed refund info - transaction not found (ID: ${txId})`, "payment", parseInt(txId));
      return res.status(404).json({ message: 'Transaction not found' });
    }

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

    await logApiCall(req, res, 200, `Viewed refund info for transaction (ID: ${txId})`, "payment", parseInt(txId));
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
    await logApiCall(req, res, 500, "Error occurred while fetching refund info", "payment", parseInt(req.params.transactionId) || 0);
    res.status(500).json({ message: 'Server error' });
  }
};