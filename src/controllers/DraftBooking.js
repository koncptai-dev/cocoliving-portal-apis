const moment = require("moment");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const {
    Property,
    Rooms,
    PropertyRateCard,
    User,
    Booking: RealBooking,
    PaymentTransaction,
    DraftBooking: DraftBookingModel,
    DraftPaymentTransaction,
    Inventory
} = require("../models");
const UserPermission = require("../models/userPermissoin");
const UserKYC = require("../models/userKYC");
const { logApiCall } = require("../helpers/auditLog");
const { sendEmail } = require("../utils/sendEmail");
const { waiveOffSubmittedAdminEmail } = require("../utils/emailTemplates/emailTemplates");

async function getAccessiblePropertyIds(user) {
    if (!user) return [];
    if (user.role === 1) return null;

    const permission = await UserPermission.findOne({
        where: { userId: user.id }
    });

    if (!permission || !Array.isArray(permission.properties)) {
        return [];
    }

    return permission.properties.map((value) => Number(value)).filter(Boolean);
}

async function getDraftBookingAccessContext(user) {
    const context = {
        isSuperAdmin: user?.role === 1,
        isPropertyAdmin: user?.role === 3,
        accessiblePropertyIds: null,
        createdByRole: null,
        createdByAdminId: null
    };

    if (context.isPropertyAdmin) {
        context.accessiblePropertyIds = await getAccessiblePropertyIds(user);
        context.createdByRole = 3;
        context.createdByAdminId = user?.id || null;
        return context;
    }

    if (context.isSuperAdmin) {
        context.createdByRole = 1;
        context.createdByAdminId = user?.id || null;
        return context;
    }

    return context;
}

async function getDraftBookingAccessFilter(user, baseWhere = {}) {
    const accessContext = await getDraftBookingAccessContext(user);
    const whereClause = { ...(baseWhere || {}) };

    if (accessContext.isPropertyAdmin) {
        if (!accessContext.accessiblePropertyIds || accessContext.accessiblePropertyIds.length === 0) {
            return { accessDenied: true, whereClause, accessContext };
        }

        whereClause.propertyId = {
            [Op.in]: accessContext.accessiblePropertyIds
        };
        whereClause.createdByRole = 3;
        return { accessDenied: false, whereClause, accessContext };
    }

    if (accessContext.isSuperAdmin) {
        whereClause.createdByRole = 1;
        return { accessDenied: false, whereClause, accessContext };
    }

    return { accessDenied: false, whereClause, accessContext };
}

function toRupees(value) {
    if (value === undefined || value === null || value === "") return 0;
    return Number(value);
}

function isPositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
}

function isValidDateFormat(value, format) {
    if (!value) return false;
    return moment(String(value), format, true).isValid();
}

function sendKnownError(res, err) {
    if (!err) return false;

    const knownDbErrors = new Set([
        "SequelizeValidationError",
        "SequelizeUniqueConstraintError",
        "SequelizeForeignKeyConstraintError"
    ]);

    if (knownDbErrors.has(err.name)) {
        const message = err.errors?.[0]?.message || err.message || "Validation failed";
        res.status(400).json({
            success: false,
            message,
            error: err.name || "ValidationError",
            details: err.errors || null,
            stack: err.stack || null
        });
        return true;
    }

    return false;
}

function isValidRupeeAmount(value) {
    return Number.isFinite(value) && value >= 0;
}

function buildErrorPayload(err, fallbackMessage = "Server error") {
    return {
        success: false,
        message: err?.message || fallbackMessage,
        error: err?.name || "Error",
        details: err?.errors || null,
        stack: err?.stack || null
    };
}

async function notifySuperAdminsForWaiveOffSubmission(booking, actorUser) {
    try {
        const superAdmins = await User.findAll({
            where: {
                role: 1,
                email: {
                    [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }]
                }
            },
            attributes: ["email"]
        });

        const recipientEmails = [...new Set(superAdmins.map((admin) => admin.email).filter(Boolean))];
        if (recipientEmails.length === 0) return;

        const subject = `Waive-off request submitted for Draft Booking #${booking.id}`;
        const template = waiveOffSubmittedAdminEmail({
            bookingId: booking.id,
            propertyId: booking.propertyId,
            submittedByName: actorUser?.fullName,
            submittedByEmail: actorUser?.email
        });

        await sendEmail({
            to: recipientEmails.join(","),
            subject,
            html: template.html,
            attachments: template.attachments
        });
    } catch (error) {
        console.error("[notifySuperAdminsForWaiveOffSubmission]", error);
    }
}

function normalizeSecurityDepositType(type) {
    const normalized = String(type || "").trim().toUpperCase();

    if (["1+1", "ONE_PLUS_ONE"].includes(normalized)) return "1+1";
    if (["1+2", "ONE_PLUS_TWO"].includes(normalized)) return "1+2";
    if (normalized === "DYNAMIC") return "DYNAMIC";

    return null;
}

function getSecurityDepositAmount(type, monthlyRent, enteredAmount) {
    if (type === "1+1") return Math.round(Number(monthlyRent || 0));
    if (type === "1+2") return Math.round(Number(monthlyRent || 0) * 2);
    return Math.round(Number(enteredAmount || 0));
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (["true", "yes", "1"].includes(String(value).toLowerCase())) return true;
    if (["false", "no", "0"].includes(String(value).toLowerCase())) return false;
    return null;
}

function normalizeMealPlan(value) {
    const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");

    if (["NONE", "NO", "NO_MEAL", "WITHOUT_MEAL", "0"].includes(normalized)) return "NONE";
    if (["2", "2_TIME", "2_TIMES", "TWO_TIME", "TWO_TIMES"].includes(normalized)) return "2_TIMES";
    if (["4", "4_TIME", "4_TIMES", "FOUR_TIME", "FOUR_TIMES"].includes(normalized)) return "4_TIMES";

    return null;
}

function calculateWaiveOffForRemainingDays(checkInDate, monthlyRent, waiveEnabled) {
    if (!waiveEnabled) {
        return {
            applied: false,
            remainingDays: 0,
            daysInMonth: 0,
            amount: 0
        };
    }

    const parsedCheckIn = moment(checkInDate, "YYYY-MM-DD", true);
    if (!parsedCheckIn.isValid()) {
        return {
            applied: true,
            remainingDays: 0,
            daysInMonth: 0,
            amount: 0
        };
    }

    const daysInMonth = parsedCheckIn.daysInMonth();
    const remainingDays = daysInMonth - parsedCheckIn.date() + 1;
    const rentPerDay = Number(monthlyRent || 0) / daysInMonth;
    const waivedAmount = Math.round(rentPerDay * remainingDays);

    return {
        applied: true,
        remainingDays,
        daysInMonth,
        amount: waivedAmount
    };
}

async function getRoomReservedCount(roomId, transaction = null) {
    const [liveCount, draftCount] = await Promise.all([
        RealBooking.count({
            where: {
                roomId,
                status: {
                    [Op.in]: ["pending", "approved", "active"]
                }
            },
            transaction
        }),
        DraftBookingModel.count({
            where: {
                roomId,
                confirmed: false,
                status: {
                    [Op.in]: ["draft_booking", "draft_payment", "draft_submitted", "draft_confirmed"]
                }
            },
            transaction
        })
    ]);

    return liveCount + draftCount;
}

async function releaseInventoryForDraftBooking(draftBooking, transaction = null) {
    if (!draftBooking.assignedItems || draftBooking.assignedItems.length === 0) return;

    await Inventory.update(
        { status: "Available" },
        {
            where: { id: draftBooking.assignedItems },
            transaction
        }
    );

    draftBooking.assignedItems = [];
    await draftBooking.save({ transaction });
}

async function assignInventorySetToDraftBooking(draftBooking, setNumber, transaction) {
    if (!setNumber) {
        return { error: "setNumber is required", statusCode: 400 };
    }

    if (!draftBooking.roomId) {
        return { error: "Room must be selected before assigning inventory", statusCode: 400 };
    }

    const room = await Rooms.findByPk(draftBooking.roomId, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    if (!room) {
        return { error: "Room not found", statusCode: 400 };
    }

    const items = await Inventory.findAll({
        where: {
            propertyId: room.propertyId,
            roomId: room.id,
            setNumber,
            isCommonAsset: false
        },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined,
        order: [["id", "ASC"]]
    });

    if (items.length === 0) {
        return { error: "Selected set has no inventory", statusCode: 400 };
    }

    const currentlyAssignedIds = Array.isArray(draftBooking.assignedItems)
        ? draftBooking.assignedItems.map(id => Number(id))
        : [];
    const currentlyAssignedSet = new Set(currentlyAssignedIds);

    if (items.some(item => item.status !== "Available" && !currentlyAssignedSet.has(Number(item.id)))) {
        return { error: "Selected set is not fully available", statusCode: 400 };
    }

    const assignedInventory = items.map(item => Number(item.id));
    const normalizedCurrentAssigned = [...currentlyAssignedIds].sort((a, b) => a - b);
    const normalizedTargetAssigned = [...assignedInventory].sort((a, b) => a - b);
    const isSameAssignment =
        normalizedCurrentAssigned.length === normalizedTargetAssigned.length &&
        normalizedCurrentAssigned.every((id, index) => id === normalizedTargetAssigned[index]);

    if (isSameAssignment) {
        return { assignedInventory, reusedExisting: true };
    }

    await releaseInventoryForDraftBooking(draftBooking, transaction);
    await Inventory.update(
        { status: "Allocated" },
        { where: { id: assignedInventory }, transaction }
    );

    draftBooking.assignedItems = assignedInventory;
    await draftBooking.save({ transaction });

    return { assignedInventory };
}

async function markDraftBookingAsConfirmed(draftBooking, transaction) {
    draftBooking.confirmed = true;

    const paymentTransaction = await DraftPaymentTransaction.findOne({
        where: {
            draftBookingId: draftBooking.id
        },
        order: [["createdAt", "DESC"]],
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    if (paymentTransaction) {
        paymentTransaction.confirmed = true;
        await paymentTransaction.save({ transaction });
    }

    await convertDraftBookingToRealRecords(draftBooking, paymentTransaction, transaction);
}

async function getLatestDraftPaymentTransaction(draftBookingId, transaction = null) {
    return DraftPaymentTransaction.findOne({
        where: {
            draftBookingId
        },
        order: [["createdAt", "DESC"]],
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
    });
}

async function convertDraftBookingToRealRecords(draftBooking, draftPaymentTransaction, transaction) {
    const paymentTransaction = draftPaymentTransaction || await getLatestDraftPaymentTransaction(draftBooking.id, transaction);

    if (!paymentTransaction) {
        throw new Error("Draft payment transaction not found for confirmed booking");
    }

    const realBooking = await RealBooking.create({
        propertyId: draftBooking.propertyId,
        userId: draftBooking.userId,
        rateCardId: draftBooking.rateCardId,
        bookingSource: draftBooking.bookingSource,
        roomType: draftBooking.roomType,
        roomId: draftBooking.roomId,
        assignedItems: draftBooking.assignedItems || [],
        checkInDate: draftBooking.checkInDate,
        checkOutDate: draftBooking.checkOutDate,
        duration: draftBooking.duration,
        monthlyRent: draftBooking.monthlyRent,
        isRentIncludingMeals: Boolean(draftBooking.isRentIncludingMeals),
        mealPlan: draftBooking.mealPlan || "NONE",
        status: "approved",
        totalAmount: draftBooking.totalAmount,
        remainingAmount: 0,
        bookingType: draftBooking.bookingType,
        paymentStatus: "COMPLETED",
        onboardingStatus: draftBooking.onboardingStatus,
        contractStatus: draftBooking.contractStatus,
        adminContractStatus: draftBooking.adminContractStatus,
        cancelRequestStatus: draftBooking.cancelRequestStatus,
        userCancelReason: draftBooking.userCancelReason,
        adminCancelReason: draftBooking.adminCancelReason,
        cancelEffectiveCheckOutDate: draftBooking.cancelEffectiveCheckOutDate,
        securityDepositPaid: draftBooking.securityDepositPaid,
        monthlyPlanSelected: draftBooking.monthlyPlanSelected,
        monthlyInstallment: draftBooking.monthlyInstallment,
        installmentsPaid: draftBooking.installmentsPaid,
        firstElectricityRechargeDone: draftBooking.firstElectricityRechargeDone,
        alisteUserId: draftBooking.alisteUserId,
        removedUserFromAliste: draftBooking.removedUserFromAliste,
        meta: {
            ...(draftBooking.meta || {}),
            source: "draft-booking",
            draftBookingId: draftBooking.id
        }
    }, { transaction });

    await PaymentTransaction.create({
        bookingId: realBooking.id,
        userId: paymentTransaction.userId,
        merchantOrderId: `INITIAL-${realBooking.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        amount: paymentTransaction.amount,
        type: "INITIAL",
        status: "SUCCESS",
        paymentMode: "OFFLINE",
        paymentDate: paymentTransaction.paymentDate || null,
        offlinePaymentType: paymentTransaction.offlinePaymentType || null,
        paymentImage: paymentTransaction.paymentImage || null,
        additionalDetails: true,
        totalAmountReceived: paymentTransaction.totalAmountReceived,
        waiveCurrentMonthRent: paymentTransaction.waiveCurrentMonthRent,
        securityDepositType: paymentTransaction.securityDepositType,
        securityDepositAmount: paymentTransaction.securityDepositAmount,
        advanceRentAmount: paymentTransaction.advanceRentAmount,
        advanceRentDurationMonths: paymentTransaction.advanceRentDurationMonths,
        mealAmount: draftBooking.mealAmount,
        mealSubscriptionAmount: paymentTransaction.mealSubscriptionAmount,
        mealSubscriptionDurationMonths: paymentTransaction.mealSubscriptionDurationMonths,
        amcChargesAmount: paymentTransaction.amcChargesAmount,
        panCardNumber: paymentTransaction.panCardNumber,
        createdByAdminId: paymentTransaction.createdByAdminId,
        rawResponse: paymentTransaction.rawResponse,
        meta: {
            ...(paymentTransaction.meta || {}),
            source: "draft-booking",
            draftBookingId: draftBooking.id,
            draftPaymentTransactionId: paymentTransaction.id
        }
    }, { transaction });
}

function formatBookingOption(booking) {
    const userName = booking.user?.fullName || `User ${booking.userId}`;
    const propertyName = booking.property?.name || "Property";
    const roomNumber = booking.room?.roomNumber ? `Room ${booking.room.roomNumber}` : booking.roomType;

    return {
        id: booking.id,
        label: `#${booking.id} - ${userName} - ${propertyName} - ${roomNumber}`,
        userId: booking.userId,
        userName,
        propertyId: booking.propertyId,
        propertyName,
        roomId: booking.roomId,
        roomNumber: booking.room?.roomNumber || null,
        roomType: booking.roomType,
        status: booking.status,
        bookingType: booking.bookingType,
        paymentStatus: booking.paymentStatus,
        totalAmount: Number(booking.totalAmount || 0),
        remainingAmount: Number(booking.remainingAmount || 0),
    };
}

async function buildBookingPaymentReview(payload, booking, transaction = null) {
    const {
        totalAmountReceived,
        totalAmountReceivedRent,
        waiveOff,
        rentAmount,
        currentMonthRent,
        waiveCurrentMonthRent = false,
        securityDepositType,
        securityDepositAmount,
        securityDeposit,
        advanceRent,
        advanceRentAmount,
        advanceRentDurationMonths,
        advanceRentDuration,
        durationOfAdvanceRentMonths,
        mealSubscription,
        mealSubscriptionAmount,
        mealAmount,
        mealSubscriptionDurationMonths,
        durationOfMealSubscriptionMonths,
        amcCharges,
        amcChargeAmount,
        panCardNumber,
        panNumber
    } = payload;

    const depositType = normalizeSecurityDepositType(securityDepositType);
    const errors = [];
    const waiveOffRequested = normalizeBoolean(waiveOff ?? waiveCurrentMonthRent);

    if (waiveOffRequested === null) {
        errors.push("waiveOff must be true or false");
    }

    const baseMonthlyRent = Math.round(Number(
        booking.baseMonthlyRent ??
        booking.monthlyRent ??
        booking.totalMonthlyAmount ??
        0
    ));
    const waiveOffDetails = calculateWaiveOffForRemainingDays(
        booking.checkInDate,
        baseMonthlyRent,
        Boolean(waiveOffRequested)
    );

    if (!depositType) {
        errors.push("securityDepositType must be 1+1, 1+2 or DYNAMIC");
    }

    const received = toRupees(totalAmountReceived ?? totalAmountReceivedRent);
    const manualRent = toRupees(rentAmount ?? currentMonthRent ?? baseMonthlyRent);
    const rent = Boolean(waiveOffRequested)
        ? Math.max(0, Math.round(baseMonthlyRent - waiveOffDetails.amount))
        : manualRent;
    const securityInput = securityDepositAmount ?? securityDeposit;
    const normalizedSecurityInput =
        securityInput === undefined || securityInput === null || securityInput === ""
            ? null
            : Math.round(Number(securityInput));
    const expectedSecurityBaseRent = Number(
        booking.baseMonthlyRent ??
        booking.monthlyRent ??
        booking.totalMonthlyAmount ??
        0
    );
    const expectedFixedSecurity = depositType && depositType !== "DYNAMIC"
        ? getSecurityDepositAmount(depositType, expectedSecurityBaseRent, securityInput)
        : null;
    const security = depositType
        ? getSecurityDepositAmount(depositType, expectedSecurityBaseRent, securityInput)
        : toRupees(securityInput);
    const advance = toRupees(advanceRent ?? advanceRentAmount);
    const meal = toRupees(mealSubscriptionAmount ?? mealSubscription ?? mealAmount);
    const parsedAdvanceRentDurationMonths =
        advanceRentDurationMonths ?? advanceRentDuration ?? durationOfAdvanceRentMonths;
    const parsedMealSubscriptionDurationMonths =
        mealSubscriptionDurationMonths ?? durationOfMealSubscriptionMonths;
    const advanceMonths =
        parsedAdvanceRentDurationMonths === undefined || parsedAdvanceRentDurationMonths === null || parsedAdvanceRentDurationMonths === ""
            ? null
            : Number(parsedAdvanceRentDurationMonths);
    const mealMonths =
        parsedMealSubscriptionDurationMonths === undefined || parsedMealSubscriptionDurationMonths === null || parsedMealSubscriptionDurationMonths === ""
            ? null
            : Number(parsedMealSubscriptionDurationMonths);
    const amc = toRupees(amcCharges ?? amcChargeAmount);

    if (!isValidRupeeAmount(received) || received <= 0) {
        errors.push("totalAmountReceived must be greater than 0");
    }

    if (!isValidRupeeAmount(rent)) {
        errors.push("rentAmount must be a valid amount");
    }

    if (!isValidRupeeAmount(security)) {
        errors.push("securityDepositAmount must be a valid amount");
    }

    if (
        expectedFixedSecurity !== null &&
        normalizedSecurityInput !== null &&
        normalizedSecurityInput !== expectedFixedSecurity
    ) {
        errors.push(`securityDepositAmount must be ${expectedFixedSecurity} for ${depositType} security deposit`);
    }

    if (depositType === "DYNAMIC" && security <= 0) {
        errors.push("securityDepositAmount is required for Dynamic security deposit");
    }

    if (!isValidRupeeAmount(advance)) {
        errors.push("advanceRent must be a valid amount");
    }

    if (!isValidRupeeAmount(meal)) {
        errors.push("mealSubscriptionAmount must be a valid amount");
    }

    if (advanceMonths !== null && (!Number.isInteger(advanceMonths) || advanceMonths < 0)) {
        errors.push("advanceRentDurationMonths must be a valid non-negative integer");
    }

    if (mealMonths !== null && (!Number.isInteger(mealMonths) || mealMonths < 0)) {
        errors.push("mealSubscriptionDurationMonths must be a valid non-negative integer");
    }

    const bookingDurationMonths = Number(booking.duration || 0);
    if (advanceMonths !== null && advanceMonths > bookingDurationMonths) {
        errors.push("advanceRentDurationMonths cannot exceed booking duration");
    }

    if (mealMonths !== null && mealMonths > bookingDurationMonths) {
        errors.push("mealSubscriptionDurationMonths cannot exceed booking duration");
    }

    const expectedAdvanceRentAmount =
        advanceMonths === null ? null : Math.round(baseMonthlyRent * advanceMonths);

    if (advanceMonths === null && Math.round(advance) > 0) {
        errors.push("advanceRentDurationMonths is required when advanceRent is greater than 0");
    }

    if (expectedAdvanceRentAmount !== null && Math.round(advance) !== expectedAdvanceRentAmount) {
        errors.push(`advanceRent must be ${expectedAdvanceRentAmount} for ${advanceMonths} month(s) duration`);
    }

    const normalizedBookingMealPlan = normalizeMealPlan(booking.mealPlan || "NONE") || "NONE";
    const propertyMealTwoTimes = Number(booking.property?.mealSubscriptionAmountTwoTimes || 0);
    const propertyMealFourTimes = Number(booking.property?.mealSubscriptionAmountFourTimes || 0);
    const configuredMealPerMonth = normalizedBookingMealPlan === "2_TIMES"
        ? Math.round(propertyMealTwoTimes)
        : normalizedBookingMealPlan === "4_TIMES"
            ? Math.round(propertyMealFourTimes)
            : 0;

    if ((normalizedBookingMealPlan === "NONE" || Boolean(booking.isRentIncludingMeals)) && (Math.round(meal) > 0 || (mealMonths !== null && mealMonths > 0))) {
        errors.push("mealSubscriptionAmount must be 0 when meal plan is NONE or rent includes meals");
    }

    if (normalizedBookingMealPlan !== "NONE" && !Boolean(booking.isRentIncludingMeals)) {
        if (mealMonths === null && Math.round(meal) > 0) {
            errors.push("mealSubscriptionDurationMonths is required when mealSubscriptionAmount is greater than 0");
        }

        if (mealMonths !== null) {
            const expectedMealSubscriptionAmount = Math.round(configuredMealPerMonth * mealMonths);
            if (Math.round(meal) !== expectedMealSubscriptionAmount) {
                errors.push(
                    `mealSubscriptionAmount must be ${expectedMealSubscriptionAmount} for ${mealMonths} month(s) with ${normalizedBookingMealPlan}`
                );
            }
        }
    }

    if (!isValidRupeeAmount(amc)) {
        errors.push("amcCharges must be a valid amount");
    }

    const computedTotal = Math.round(security + advance + meal + amc);

    if (Math.round(received) !== computedTotal) {
        errors.push("Total Amount Received must equal Security Deposit + Advance Rent + Meal Subscription + AMC Charges");
    }

    const kyc = await UserKYC.findOne({
        where: {
            userId: booking.userId
        },
        attributes: ["panNumber", "panStatus"],
        transaction
    });

    const existingPan = kyc?.panNumber || null;
    const finalPanNumber = panCardNumber || panNumber || existingPan;

    if (received > 100000) {
        if (!finalPanNumber) {
            errors.push("PAN card number is required when amount is greater than INR 1,00,000");
        } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(finalPanNumber).toUpperCase())) {
            errors.push("PAN card number must be valid");
        }
    }

    return {
        errors,
        review: {
            booking: formatBookingOption(booking),
            inputs: {
                totalAmountReceived: Math.round(received),
                rentAmount: Math.round(rent),
                waiveCurrentMonthRent: Boolean(waiveOffRequested),
                securityDepositType: depositType,
                securityDepositAmount: Math.round(security),
                advanceRent: Math.round(advance),
                advanceRentDurationMonths: advanceMonths,
                mealSubscriptionAmount: Math.round(meal),
                mealSubscriptionDurationMonths: mealMonths,
                amcCharges: Math.round(amc),
                panCardNumber: finalPanNumber || null
            },
            calculated: {
                rentAmount: Math.round(rent),
                securityDepositAmount: Math.round(security),
                advanceRent: Math.round(advance),
                advanceRentDurationMonths: advanceMonths,
                mealSubscriptionAmount: Math.round(meal),
                mealSubscriptionDurationMonths: mealMonths,
                amcCharges: Math.round(amc),
                waiveOff: waiveOffDetails,
                totalAmountReceived: Math.round(received),
                expectedTotal: computedTotal,
                difference: Math.round(received) - computedTotal,
                panRequired: received > 100000,
                gstApplicableOnInvoice: received > 20000,
                invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL"
            }
        }
    };
}

exports.draftBooking=async(req,res)=>{
    const transaction = await sequelize.transaction();

    try {
        const {
            propertyId,
            roomId,
            userId,
            checkInDate,
            duration,
            bookingType,
            bookingSource = "OFFLINE",
            monthlyRent,
            isRentIncludingMeals,
            mealPlan,
            totalMonthlyAmount,
            setNumber
        } = req.body;

        if (!propertyId || !roomId || !userId || !checkInDate || !duration || !bookingType || isRentIncludingMeals === undefined) {
            await transaction.rollback();
            return res.status(400).json({message: "Missing required fields."});
        }

        if (!isPositiveInteger(propertyId) || !isPositiveInteger(roomId) || !isPositiveInteger(userId)) {
            await transaction.rollback();
            return res.status(400).json({ message: "propertyId, roomId and userId must be positive integers." });
        }

        const normalizedBookingType = String(bookingType).toUpperCase();
        if (!["BOOK", "PREBOOK"].includes(normalizedBookingType)) {
            await transaction.rollback();
            return res.status(400).json({message: "bookingType must be BOOK or PREBOOK."});
        }

        const normalizedBookingSource = String(bookingSource).toUpperCase();
        if (!["ONLINE", "OFFLINE"].includes(normalizedBookingSource)) {
            await transaction.rollback();
            return res.status(400).json({message: "bookingSource must be ONLINE or OFFLINE."});
        }

        const normalizedDuration = Number(duration);
        if (!Number.isInteger(normalizedDuration) || normalizedDuration < 6 || normalizedDuration > 12) {
            await transaction.rollback();
            return res.status(400).json({message: "duration must be between 6 and 12 months."});
        }

        if (!isValidDateFormat(checkInDate, "YYYY-MM-DD")) {
            await transaction.rollback();
            return res.status(400).json({message: "checkInDate must be in YYYY-MM-DD format."});
        }

        const normalizedCheckInDate = moment(checkInDate, "YYYY-MM-DD", true);
        const today = moment().startOf("day");
        const maxCheckInDate = moment(today).add(3, "months").endOf("day");

        if (normalizedCheckInDate.isBefore(today) || normalizedCheckInDate.isAfter(maxCheckInDate)) {
            await transaction.rollback();
            return res.status(400).json({message: "checkInDate must be between today and 3 months from today."});
        }

        if (
            monthlyRent !== undefined &&
            monthlyRent !== null &&
            (Number.isNaN(Number(monthlyRent)) || Number(monthlyRent) <= 0)
        ) {
            await transaction.rollback();
            return res.status(400).json({message: "monthlyRent must be a positive number."});
        }

        const rentIncludesMeals = normalizeBoolean(isRentIncludingMeals);
        if (rentIncludesMeals === null) {
            await transaction.rollback();
            return res.status(400).json({message: "isRentIncludingMeals must be true or false."});
        }

        const normalizedMealPlan = normalizeMealPlan(mealPlan || "NONE");
        if (!normalizedMealPlan) {
            await transaction.rollback();
            return res.status(400).json({message: "mealPlan must be NONE, 2_TIMES or 4_TIMES."});
        }

        if (rentIncludesMeals && normalizedMealPlan === "NONE") {
            await transaction.rollback();
            return res.status(400).json({message: "mealPlan must be 2_TIMES or 4_TIMES when rent includes meals."});
        }

        const isPropertyAdmin = req.user?.role === 3;
        if (isPropertyAdmin) {
            const accessiblePropertyIds = await getAccessiblePropertyIds(req.user);

            if (!accessiblePropertyIds || accessiblePropertyIds.length === 0) {
                await transaction.rollback();
                return res.status(403).json({ message: "No property access assigned" });
            }

            if (!accessiblePropertyIds.includes(Number(propertyId))) {
                await transaction.rollback();
                return res.status(403).json({ message: "Access Denied: Property not allowed" });
            }
        }

        const property = await Property.findByPk(propertyId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!property) {
            await transaction.rollback();
            return res.status(404).json({message: "Property not found."});
        }

        const room = await Rooms.findOne({
            where: {
                id: roomId,
                propertyId
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!room) {
            await transaction.rollback();
            return res.status(404).json({message: "Room not found for selected property."});
        }

        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!user) {
            await transaction.rollback();
            return res.status(404).json({message: "User not found."});
        }

        const rateCard = await PropertyRateCard.findOne({
            where: {
                propertyId,
                roomType: room.roomType
            },
            transaction
        });

        if (!rateCard) {
            await transaction.rollback();
            return res.status(404).json({message: "Rate card not found."});
        }

        const checkOutDate = moment(checkInDate)
            .add(normalizedDuration, "months")
            .subtract(1, "day")
            .format("YYYY-MM-DD");

        const overlappingDraftBooking = await DraftBookingModel.findOne({
            where: {
                userId,
                confirmed: false,
                status: {
                    [Op.in]: ["draft_booking", "draft_payment", "draft_submitted", "draft_confirmed"]
                },
                [Op.or]: [
                    {
                        checkOutDate: {
                            [Op.is]: null
                        },
                        checkInDate: {
                            [Op.lte]: checkOutDate
                        }
                    },
                    {
                        checkOutDate: {
                            [Op.gte]: checkInDate
                        },
                        checkInDate: {
                            [Op.lte]: checkOutDate
                        }
                    }
                ]
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        const isUpdatingExistingDraft = Boolean(overlappingDraftBooking);

        if (
            isUpdatingExistingDraft &&
            isPropertyAdmin &&
            Number(overlappingDraftBooking.createdByAdminId) !== Number(req.user?.id)
        ) {
            await transaction.rollback();
            return res.status(403).json({
                message: "This user already has an active draft booking created by another admin for this period."
            });
        }

        const activeCount = await getRoomReservedCount(roomId, transaction);
        const isSameRoomUpdate =
            isUpdatingExistingDraft &&
            Number(overlappingDraftBooking.roomId) === Number(roomId);
        const effectiveRoomCountForCapacity = isSameRoomUpdate
            ? Math.max(0, activeCount - 1)
            : activeCount;

        if (effectiveRoomCountForCapacity >= room.capacity) {
            await transaction.rollback();
            return res.status(400).json({message: "Room is already full."});
        }

        const finalMonthlyRent =
            monthlyRent !== undefined && monthlyRent !== null
                ? Number(monthlyRent)
                : Number(rateCard.rent ?? room.monthlyRent);

        if (normalizeMealPlan == "2_TIMES") {
            mealAmount = property.mealSubscriptionAmountTwoTimes
        } else if (normalizeMealPlan == "4_TIMES") {
            mealAmount = property.mealSubscriptionAmountFourTimes
        }
        const finalTotalMonthlyAmount = Math.round(finalMonthlyRent + mealAmount);

        if (
            totalMonthlyAmount !== undefined &&
            totalMonthlyAmount !== null &&
            Number(totalMonthlyAmount) !== finalTotalMonthlyAmount
        ) {
            await transaction.rollback();
            return res.status(400).json({
                message: "totalMonthlyAmount must equal monthlyRent plus meal amount."
            });
        }

        const securityDeposit = Number(room.depositAmount ?? finalTotalMonthlyAmount * 2);
        const totalAmount = Math.round(finalTotalMonthlyAmount * normalizedDuration + securityDeposit);

        const previousRoomId = isUpdatingExistingDraft ? overlappingDraftBooking.roomId : null;
        const isRoomChanged = isUpdatingExistingDraft && Number(previousRoomId) !== Number(roomId);
        const isSetNumberProvided = setNumber !== undefined && setNumber !== null && setNumber !== "";

        let booking;
        if (isUpdatingExistingDraft) {
            booking = overlappingDraftBooking;

            booking.propertyId = propertyId;
            booking.userId = userId;
            booking.roomId = roomId;
            booking.roomType = room.roomType;
            booking.rateCardId = rateCard.id;
            booking.bookingType = normalizedBookingType;
            booking.bookingSource = normalizedBookingSource;
            booking.checkInDate = checkInDate;
            booking.checkOutDate = checkOutDate;
            booking.duration = normalizedDuration;
            booking.monthlyRent = finalTotalMonthlyAmount;
            booking.totalAmount = totalAmount;
            booking.remainingAmount = totalAmount;
            booking.status = "draft_booking";
            booking.paymentStatus = "INITIATED";
            booking.onboardingStatus = "NOT_INITIATED";
            booking.contractStatus = "NOT_SIGNED";
            booking.adminContractStatus = "NOT_SIGNED";
            booking.baseMonthlyRent = finalMonthlyRent;
            booking.isRentIncludingMeals = rentIncludesMeals;
            booking.mealPlan = normalizedMealPlan;
            booking.mealAmount = mealAmount;
            booking.totalMonthlyAmount = finalTotalMonthlyAmount;
            booking.confirmed = false;

            await booking.save({ transaction });
        } else {
            booking = await DraftBookingModel.create(
                {
                    propertyId,
                    userId,
                    roomId,
                    roomType: room.roomType,
                    rateCardId: rateCard.id,

                    bookingType: normalizedBookingType,
                    bookingSource: normalizedBookingSource,

                    checkInDate,
                    checkOutDate,
                    duration: normalizedDuration,

                    monthlyRent: finalTotalMonthlyAmount,

                    totalAmount,
                    remainingAmount: totalAmount,

                    createdByRole: req.user?.role || null,
                    createdByAdminId: req.user?.id || null,
                    status: "draft_booking",

                    paymentStatus: "INITIATED",
                    onboardingStatus: "NOT_INITIATED",
                    contractStatus: "NOT_SIGNED",
                    adminContractStatus: "NOT_SIGNED",
                    assignedItems: [],
                    baseMonthlyRent: finalMonthlyRent,
                    isRentIncludingMeals: rentIncludesMeals,
                    mealPlan: normalizedMealPlan,
                    mealAmount,
                    totalMonthlyAmount: finalTotalMonthlyAmount
                },
                {
                    transaction
                }
            );
        }

        if (isRoomChanged && !isSetNumberProvided) {
            await releaseInventoryForDraftBooking(booking, transaction);
        }

        if (isSetNumberProvided) {
            const assignment = await assignInventorySetToDraftBooking(booking, setNumber, transaction);

            if (assignment.error) {
                await transaction.rollback();
                return res.status(assignment.statusCode).json({ message: assignment.error });
            }
        }

        if (isUpdatingExistingDraft) {
            const latestTargetCount = await getRoomReservedCount(roomId, transaction);
            room.status = latestTargetCount >= room.capacity ? "booked" : "available";
            await room.save({ transaction });

            if (Number(previousRoomId) !== Number(roomId) && previousRoomId) {
                const previousRoom = await Rooms.findByPk(previousRoomId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });

                if (previousRoom) {
                    const previousRoomCount = await getRoomReservedCount(previousRoomId, transaction);
                    previousRoom.status = previousRoomCount >= previousRoom.capacity ? "booked" : "available";
                    await previousRoom.save({ transaction });
                }
            }
        } else {
            room.status = activeCount + 1 >= room.capacity ? "booked" : "available";
            await room.save({ transaction });
        }

        await transaction.commit();
        await logApiCall(
            req,
            res,
            isUpdatingExistingDraft ? 200 : 201,
            isUpdatingExistingDraft ? "Draft booking updated successfully" : "Draft booking created successfully",
            "Draft Booking",
            booking.id
        );

        const frontendSummary = {
            property: {
                id: property.id,
                name: property.name,
                mealSubscriptionAmountTwoTimes: Number(property.mealSubscriptionAmountTwoTimes || 0),
                mealSubscriptionAmountFourTimes: Number(property.mealSubscriptionAmountFourTimes || 0)
            },
            room: {
                id: room.id,
                rent: Number(room.monthlyRent || 0),
                depositAmount: Number(room.depositAmount || 0)
            }
        };

        return res.status(isUpdatingExistingDraft ? 200 : 201).json({
            message: isUpdatingExistingDraft ? "Draft booking updated successfully." : "Draft booking created successfully.",
            booking,
            frontendSummary
        });
    } catch (err) {
        await transaction.rollback();
        console.error(err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while creating draft booking", "Draft Booking");
            return;
        }
        await logApiCall(req, res, 500, "Error while creating draft booking", "Draft Booking");
        return res.status(500).json(buildErrorPayload(err, "Internal server error."));
    }
}

exports.getBookingPaymentFormData = async (req, res) => {
    try {
        const { bookingId } = req.query;

        if (bookingId !== undefined && bookingId !== null && bookingId !== "" && !isPositiveInteger(bookingId)) {
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const access = await getDraftBookingAccessFilter(req.user, {
            status: {
                [Op.in]: ["draft_booking", "draft_payment"]
            }
        });

        if (access.accessDenied) {
            return res.status(403).json({ success: false, message: "No property access assigned" });
        }

        const bookings = await DraftBookingModel.findAll({
            where: access.whereClause,
            include: [
                { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                { model: Property, as: "property", attributes: ["id", "name", "address"] }
            ],
            order: [["createdAt", "DESC"]]
        });

        const response = {
            success: true,
            bookings: bookings.map(formatBookingOption),
            selectedBooking: null
        };

        if (bookingId) {
            const selectedBooking = bookings.find(
                booking => String(booking.id) === String(bookingId)
            ) || await DraftBookingModel.findOne({
                where: {
                    id: bookingId,
                    ...access.whereClause
                },
                include: [
                    { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                    { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                    { model: Property, as: "property", attributes: ["id", "name", "address"] }
                ]
            });

            if (!selectedBooking) {
                await logApiCall(req, res, 404, `Viewed draft booking payment form - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
                return res.status(404).json({ success: false, message: "Booking not found" });
            }

            const transactions = await DraftPaymentTransaction.findAll({
                where: {
                    draftBookingId: selectedBooking.id,
                    status: "SUCCESS"
                }
            });

            const paidRupees = transactions.reduce(
                (sum, transaction) => sum + Number(transaction.amount || 0) / 100,
                0
            );

            const kyc = await UserKYC.findOne({
                where: {
                    userId: selectedBooking.userId
                },
                attributes: ["panNumber", "panStatus"]
            });

            const monthlyRent = Number(selectedBooking.monthlyRent || selectedBooking.room?.monthlyRent || 0);

            response.selectedBooking = {
                ...formatBookingOption(selectedBooking),
                checkInDate: selectedBooking.checkInDate,
                checkOutDate: selectedBooking.checkOutDate,
                duration: selectedBooking.duration,
                monthlyRent,
                baseMonthlyRent: Number(selectedBooking.meta?.baseMonthlyRent || monthlyRent),
                isRentIncludingMeals: selectedBooking.meta?.isRentIncludingMeals ?? null,
                mealPlan: selectedBooking.meta?.mealPlan || null,
                mealAmount: Number(selectedBooking.meta?.mealAmount || 0),
                totalMonthlyAmount: Number(selectedBooking.meta?.totalMonthlyAmount || monthlyRent),
                totalPaidAmount: Math.round(paidRupees),
                depositAmount: Number(selectedBooking.room?.depositAmount || 0),
                pan: {
                    required: Number(selectedBooking.remainingAmount || 0) > 100000,
                    panNumber: kyc?.panNumber || null,
                    panStatus: kyc?.panStatus || null
                }
            };
        }

        await logApiCall(req, res, 200, "Viewed draft booking payment form data", "Draft Booking", req.user?.id || 0);
        return res.json(response);
    } catch (err) {
        console.error("[getBookingPaymentFormData]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while fetching draft booking payment form data", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while fetching draft booking payment form data", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.getDraftBookingDetails = async (req, res) => {
    try {
        const bookingId = req.params.bookingId || req.query.bookingId;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const access = await getDraftBookingAccessFilter(req.user);
        if (access.accessDenied) {
            await logApiCall(req, res, 403, `Viewed draft booking details - property access denied (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(403).json({ success: false, message: "No property access assigned" });
        }

        const booking = await DraftBookingModel.findOne({
            where: {
                id: bookingId,
                ...access.whereClause
            },
            include: [
                { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                { model: Property, as: "property", attributes: ["id", "name", "address"] }
            ]
        });

        if (!booking) {
            await logApiCall(req, res, 404, `Viewed draft booking details - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.status === "draft_discard") {
            return res.status(400).json({ success: false, message: "Discarded draft booking cannot be accessed" });
        }

        const reviewData = booking.meta?.draftBookingPaymentReview || null;
        const reviewInputs = reviewData?.inputs || {};

        const baseMonthlyRent = Number(
            booking.baseMonthlyRent ??
            booking.meta?.baseMonthlyRent ??
            booking.monthlyRent ??
            booking.totalMonthlyAmount ??
            0
        );

        const transactions = await DraftPaymentTransaction.findAll({
            where: {
                draftBookingId: booking.id,
                status: {
                    [Op.in]: ["PENDING", "SUCCESS"]
                }
            },
            order: [["createdAt", "DESC"]]
        });

        const totalCollected = transactions
            .filter((transaction) => transaction.status === "SUCCESS")
            .reduce((sum, transaction) => sum + Number(transaction.amount || 0) / 100, 0);

        const latestTransaction = transactions[0] || null;

        const paymentFieldSource = {
            totalAmountReceived:
                latestTransaction?.totalAmountReceived ??
                reviewInputs.totalAmountReceived ??
                0,
            rentAmount:
                latestTransaction?.rentAmount ??
                reviewInputs.rentAmount ??
                0,
            waiveCurrentMonthRent:
                latestTransaction?.waiveCurrentMonthRent ??
                reviewInputs.waiveCurrentMonthRent ??
                false,
            securityDepositType:
                latestTransaction?.securityDepositType ??
                reviewInputs.securityDepositType ??
                null,
            securityDepositAmount:
                latestTransaction?.securityDepositAmount ??
                reviewInputs.securityDepositAmount ??
                0,
            advanceRentAmount:
                latestTransaction?.advanceRentAmount ??
                reviewInputs.advanceRent ??
                0,
            advanceRentDurationMonths:
                latestTransaction?.advanceRentDurationMonths ??
                reviewInputs.advanceRentDurationMonths ??
                null,
            mealSubscriptionAmount:
                latestTransaction?.mealSubscriptionAmount ??
                reviewInputs.mealSubscriptionAmount ??
                0,
            mealSubscriptionDurationMonths:
                latestTransaction?.mealSubscriptionDurationMonths ??
                reviewInputs.mealSubscriptionDurationMonths ??
                null,
            amcChargesAmount:
                latestTransaction?.amcChargesAmount ??
                reviewInputs.amcCharges ??
                0,
            panCardNumber:
                latestTransaction?.panCardNumber ??
                reviewInputs.panCardNumber ??
                null
        };

        const waiveOff = calculateWaiveOffForRemainingDays(
            booking.checkInDate,
            baseMonthlyRent,
            Boolean(paymentFieldSource.waiveCurrentMonthRent)
        );

        const payload = {
            success: true,
            booking: {
                id: booking.id,
                property: {
                    id: booking.propertyId,
                    name: booking.property?.name || null,
                    address: booking.property?.address || null
                },
                room: {
                    id: booking.roomId,
                    roomNumber: booking.room?.roomNumber || null,
                    roomType: booking.roomType || booking.room?.roomType || null
                },
                user: {
                    id: booking.userId,
                    fullName: booking.user?.fullName || null,
                    email: booking.user?.email || null,
                    phone: booking.user?.phone || null
                },
                checkInDate: booking.checkInDate,
                checkOutDate: booking.checkOutDate,
                duration: booking.duration,
                bookingType: booking.bookingType,
                status: booking.status,
                monthlyRent: Number(booking.monthlyRent || 0),
                baseMonthlyRent,
                mealAmount: Number(booking.mealAmount || 0),
                totalMonthlyAmount: Number(booking.totalMonthlyAmount || 0),
                isRentIncludingMeals: Boolean(booking.isRentIncludingMeals),
                mealPlan: booking.mealPlan || "NONE",
                assignedItems: booking.assignedItems || []
            },
            payment: {
                bookingReference: `BKG-${String(booking.id).padStart(4, "0")}`,
                rentReceived: Number(paymentFieldSource.rentAmount || 0),
                waiveOff,
                securityDepositType: paymentFieldSource.securityDepositType,
                securityDepositAmount: Number(paymentFieldSource.securityDepositAmount || 0),
                advanceRent: Number(paymentFieldSource.advanceRentAmount || 0),
                advanceRentDurationMonths: paymentFieldSource.advanceRentDurationMonths,
                mealSubscriptionAmount: Number(paymentFieldSource.mealSubscriptionAmount || 0),
                mealSubscriptionDurationMonths: paymentFieldSource.mealSubscriptionDurationMonths,
                amcCharges: Number(paymentFieldSource.amcChargesAmount || 0),
                panCardNumber: paymentFieldSource.panCardNumber,
                totalAmountReceived: Number(paymentFieldSource.totalAmountReceived || 0),
                totalCollected: Math.round(totalCollected),
                latestTransaction: latestTransaction
                    ? {
                        id: latestTransaction.id,
                        status: latestTransaction.status,
                        amount: Number(latestTransaction.amount || 0) / 100,
                        paymentType: latestTransaction.offlinePaymentType || null,
                        paymentDate: latestTransaction.paymentDate || null,
                        createdAt: latestTransaction.createdAt
                    }
                    : null
            }
        };

        await logApiCall(req, res, 200, `Viewed draft booking details (ID: ${booking.id})`, "Draft Booking", req.user?.id || 0);
        return res.status(200).json(payload);
    } catch (err) {
        console.error("[getDraftBookingDetails]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while fetching draft booking details", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while fetching draft booking details", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.reviewBookingPayment = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { bookingId, paymentType = "CASH", paymentDate } = req.body;
        const adminId = req.user?.id || null;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const normalizedPaymentType = String(paymentType).toUpperCase();
        if (!["CASH", "CHEQUE", "UPI"].includes(normalizedPaymentType)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "paymentType must be CASH, CHEQUE or UPI" });
        }

        if (paymentDate && !isValidDateFormat(paymentDate, "DD/MM/YYYY")) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "paymentDate must be in DD/MM/YYYY format" });
        }

        const access = await getDraftBookingAccessFilter(req.user);
        if (access.accessDenied) {
            await transaction.rollback();
            await logApiCall(req, res, 403, `Reviewed draft booking payment - property access denied (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(403).json({ success: false, message: "No property access assigned" });
        }

        const bookingLookup = await DraftBookingModel.findOne({
            where: {
                id: bookingId,
                ...access.whereClause
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!bookingLookup) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Reviewed draft booking payment - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const booking = await DraftBookingModel.findOne({
            where: { id: bookingLookup.id },
            include: [
                { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                { model: Property, as: "property", attributes: ["id", "name", "address", "mealSubscriptionAmountTwoTimes", "mealSubscriptionAmountFourTimes"] }
            ],
            transaction
        });

        if (booking.status === "draft_discard") {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Discarded draft booking cannot be edited" });
        }

        const { errors, review } = await buildBookingPaymentReview(req.body, booking, transaction);

        if (errors.length > 0) {
            await transaction.rollback();
            await logApiCall(req, res, 400, `Reviewed draft booking payment - validation failed (Booking ID: ${booking.id})`, "Draft Booking", req.user?.id || 0);
            return res.status(400).json({
                success: false,
                message: "Booking payment review validation failed",
                errors,
                review
            });
        }

        const amountReceived = review.calculated.totalAmountReceived;
        const amountPaise = Math.round(amountReceived * 100);

        let paymentTransaction = await DraftPaymentTransaction.findOne({
            where: {
                draftBookingId: booking.id
            },
            order: [["createdAt", "DESC"]],
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!paymentTransaction) {
            paymentTransaction = await DraftPaymentTransaction.create({
                draftBookingId: booking.id,
                userId: booking.userId,
                merchantOrderId: `DRAFT-OFFLINE-PENDING-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                amount: amountPaise,
                type: "OFFLINE",
                status: "SUCCESS",
                paymentMode: "OFFLINE",
                offlinePaymentType: normalizedPaymentType,
                createdByAdminId: adminId,
                paymentDate: paymentDate || null,
                totalAmountReceived: review.inputs.totalAmountReceived,
                rentAmount: review.inputs.rentAmount,
                waiveCurrentMonthRent: review.inputs.waiveCurrentMonthRent,
                securityDepositType: review.inputs.securityDepositType,
                securityDepositAmount: review.inputs.securityDepositAmount,
                advanceRentAmount: review.inputs.advanceRent,
                advanceRentDurationMonths: review.inputs.advanceRentDurationMonths,
                mealSubscriptionAmount: review.inputs.mealSubscriptionAmount,
                mealSubscriptionDurationMonths: review.inputs.mealSubscriptionDurationMonths,
                amcChargesAmount: review.inputs.amcCharges,
                panCardNumber: review.inputs.panCardNumber,
                rawResponse: {
                    manuallyCreated: true,
                    createdFrom: "draft-booking-review",
                    createdAt: new Date().toISOString()
                },
                meta: {
                    source: "draft-booking",
                    acknowledgementRequired: true,
                    invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL",
                    invoiceNote: "Invoice is generated only after accountant approval"
                },
                confirmed: true
            }, { transaction });
        } else {
            paymentTransaction.amount = amountPaise;
            paymentTransaction.offlinePaymentType = normalizedPaymentType;
            paymentTransaction.paymentDate = paymentDate || null;
            paymentTransaction.createdByAdminId = adminId;
            paymentTransaction.totalAmountReceived = review.inputs.totalAmountReceived;
            paymentTransaction.rentAmount = review.inputs.rentAmount;
            paymentTransaction.waiveCurrentMonthRent = review.inputs.waiveCurrentMonthRent;
            paymentTransaction.securityDepositType = review.inputs.securityDepositType;
            paymentTransaction.securityDepositAmount = review.inputs.securityDepositAmount;
            paymentTransaction.advanceRentAmount = review.inputs.advanceRent;
            paymentTransaction.advanceRentDurationMonths = review.inputs.advanceRentDurationMonths;
            paymentTransaction.mealSubscriptionAmount = review.inputs.mealSubscriptionAmount;
            paymentTransaction.mealSubscriptionDurationMonths = review.inputs.mealSubscriptionDurationMonths;
            paymentTransaction.amcChargesAmount = review.inputs.amcCharges;
            paymentTransaction.panCardNumber = review.inputs.panCardNumber;
            paymentTransaction.rawResponse = {
                ...(paymentTransaction.rawResponse || {}),
                manuallyCreated: true,
                updatedFrom: "draft-booking-review",
                updatedAt: new Date().toISOString()
            };
            paymentTransaction.status = "SUCCESS";
            paymentTransaction.confirmed = true;
            paymentTransaction.meta = {
                ...(paymentTransaction.meta || {}),
                source: "draft-booking",
                acknowledgementRequired: true,
                invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL",
                invoiceNote: "Invoice is generated only after accountant approval"
            };
            await paymentTransaction.save({ transaction });
        }

        booking.status = "draft_payment";
        await booking.save({ transaction });

        await transaction.commit();

        await logApiCall(req, res, 200, `Reviewed draft booking payment (Booking ID: ${booking.id})`, "Draft Booking", booking.id);
        return res.json({
            success: true,
            message: "Booking payment review validated successfully",
            booking,
            transaction: paymentTransaction,
            review
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[reviewBookingPayment]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while reviewing draft booking payment", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while reviewing draft booking payment", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.confirmBookingPayment = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const bookingId = req.body?.bookingId;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const access = await getDraftBookingAccessFilter(req.user);
        if (access.accessDenied) {
            await transaction.rollback();
            await logApiCall(req, res, 403, `Confirmed draft booking payment - property access denied (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(403).json({ success: false, message: "No property access assigned" });
        }

        const booking = await DraftBookingModel.findOne({
            where: {
                id: bookingId,
                ...access.whereClause
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!booking) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Confirmed draft booking payment - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const latestTransaction = await getLatestDraftPaymentTransaction(booking.id, transaction);

        if (!["draft_payment", "draft_submitted"].includes(booking.status)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Only draft_payment or draft_submitted booking can be confirmed"
            });
        }

        const previousStatus = booking.status;
        const isCreatedByPropertyAdmin = Number(booking.createdByRole) === 3;
        const isCreatedBySuperAdmin = Number(booking.createdByRole) === 1;
        const waiveOffEnabled = Boolean(latestTransaction?.waiveCurrentMonthRent);

        if (isCreatedByPropertyAdmin) {
            if (waiveOffEnabled) {
                booking.status = "draft_submitted";
            } else {
                booking.status = "draft_confirmed";
                await markDraftBookingAsConfirmed(booking, transaction);
                // TODO: add property-admin no-waive confirmation logic.
            }
        } else if (isCreatedBySuperAdmin) {
            booking.status = "draft_confirmed";
            await markDraftBookingAsConfirmed(booking, transaction);
            // TODO: add super-admin confirmation logic.
        } else {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Booking creator role is invalid for confirmation"
            });
        }

        await booking.save({ transaction });
        await transaction.commit();

        const shouldNotifySuperAdminForWaiveOff =
            Number(req.user?.role) === 3 &&
            isCreatedByPropertyAdmin &&
            waiveOffEnabled &&
            previousStatus !== "draft_submitted" &&
            booking.status === "draft_submitted";

        if (shouldNotifySuperAdminForWaiveOff) {
            await notifySuperAdminsForWaiveOffSubmission(booking, req.user);
        }

        await logApiCall(req, res, 200, `Confirmed draft booking payment (Booking ID: ${booking.id})`, "Draft Booking", booking.id);
        return res.status(200).json({
            success: true,
            message: "Draft booking confirmation processed successfully",
            booking
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[confirmBookingPayment]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while confirming draft booking payment", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while confirming draft booking payment", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.decideWaiveOffRequest = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        if (req.user?.role !== 1) {
            await transaction.rollback();
            return res.status(403).json({ success: false, message: "Only super admin can decide waive-off requests" });
        }

        const bookingId = req.body?.bookingId || req.params?.bookingId || req.query?.bookingId;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        if (typeof req.body?.approved !== "boolean") {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "approved is required and must be true or false" });
        }

        const booking = await DraftBookingModel.findOne({
            where: { id: bookingId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!booking) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Waive-off decision failed - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const latestTransaction = await getLatestDraftPaymentTransaction(booking.id, transaction);

        if (Number(booking.createdByRole) !== 3) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Waive-off decision is only applicable for property-admin created draft bookings" });
        }

        if (booking.status !== "draft_submitted") {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Only draft_submitted booking can be processed for waive-off decision" });
        }

        if (!latestTransaction?.waiveCurrentMonthRent) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "No waive-off request found for this booking" });
        }

        if (req.body.approved) {
            booking.status = "draft_confirmed";
            await markDraftBookingAsConfirmed(booking, transaction);
            // TODO: add super-admin accepted waive-off downstream logic.
        } else {
            booking.status = "draft_rejected";
        }

        await booking.save({ transaction });
        await transaction.commit();

        await logApiCall(req, res, 200, `Waive-off request ${req.body.approved ? "accepted" : "rejected"} (Booking ID: ${booking.id})`, "Draft Booking", booking.id);
        return res.status(200).json({
            success: true,
            message: `Waive-off request ${req.body.approved ? "accepted" : "rejected"} successfully`,
            booking
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[decideWaiveOffRequest]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while deciding waive-off request", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while deciding waive-off request", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.cancelDraftBooking = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const bookingId = req.params?.bookingId;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const booking = await DraftBookingModel.findOne({
            where: { id: bookingId },
            include: [
                { model: Rooms, as: "room", required: true, attributes: ["id", "status", "capacity"] }
            ],
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!booking) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Cancelled draft booking - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (Number(booking.createdByAdminId) !== Number(req.user?.id)) {
            await transaction.rollback();
            return res.status(403).json({ success: false, message: "Only the booking creator can cancel this booking" });
        }

        if (!["draft_booking", "draft_payment", "draft_submitted", "draft_confirmed"].includes(booking.status)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Only active draft bookings can be cancelled" });
        }

        booking.status = "draft_cancelled";
        await booking.save({ transaction });

        await releaseInventoryForDraftBooking(booking, transaction);

        const room = booking.room || (booking.roomId ? await Rooms.findByPk(booking.roomId, { transaction, lock: transaction.LOCK.UPDATE }) : null);
        if (room) {
            room.status = "available";
            await room.save({ transaction });
        }

        await transaction.commit();

        await logApiCall(req, res, 200, `Cancelled draft booking (Booking ID: ${booking.id})`, "Draft Booking", booking.id);
        return res.status(200).json({
            success: true,
            message: "Draft booking cancelled successfully",
            booking
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[cancelDraftBooking]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while cancelling draft booking", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while cancelling draft booking", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};

exports.discardDraftBooking = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const bookingId = req.params?.bookingId;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        if (!isPositiveInteger(bookingId)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId must be a positive integer" });
        }

        const booking = await DraftBookingModel.findOne({
            where: { id: bookingId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!booking) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Discarded draft booking - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (Number(booking.createdByAdminId) !== Number(req.user?.id)) {
            await transaction.rollback();
            return res.status(403).json({ success: false, message: "Only the booking creator can discard this booking" });
        }

        if (booking.status === "draft_discard") {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Draft booking is already discarded" });
        }

        if (!["draft_booking", "draft_payment", "draft_submitted", "draft_confirmed", "draft_rejected", "draft_cancelled"].includes(booking.status)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "This draft booking cannot be discarded" });
        }

        booking.status = "draft_discard";
        await booking.save({ transaction });

        await releaseInventoryForDraftBooking(booking, transaction);

        const room = booking.roomId ? await Rooms.findByPk(booking.roomId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
        if (room) {
            const activeCount = await getRoomReservedCount(room.id, transaction);
            room.status = activeCount >= room.capacity ? "booked" : "available";
            await room.save({ transaction });
        }

        await transaction.commit();

        await logApiCall(req, res, 200, `Discarded draft booking (Booking ID: ${booking.id})`, "Draft Booking", booking.id);
        return res.status(200).json({
            success: true,
            message: "Draft booking discarded successfully",
            booking
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[discardDraftBooking]", err);
        if (sendKnownError(res, err)) {
            await logApiCall(req, res, 400, "Validation error while discarding draft booking", "Draft Booking", req.user?.id || 0);
            return;
        }
        await logApiCall(req, res, 500, "Error while discarding draft booking", "Draft Booking", req.user?.id || 0);
        return res.status(500).json(buildErrorPayload(err));
    }
};