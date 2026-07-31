const moment = require("moment");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const {
    Property,
    Rooms,
    PropertyRateCard,
    User,
    Booking: RealBooking,
    DraftBooking: DraftBookingModel,
    DraftPaymentTransaction,
    Inventory
} = require("../models");
const UserKYC = require("../models/userKYC");
const { logApiCall } = require("../helpers/auditLog");

let draftTablesReady;

function ensureDraftTables() {
    if (!draftTablesReady) {
        draftTablesReady = Promise.all([
            DraftBookingModel.sync({ alter: true }),
            DraftPaymentTransaction.sync({ alter: true })
        ]);
    }

    return draftTablesReady;
}

function toRupees(value) {
    if (value === undefined || value === null || value === "") return 0;
    return Number(value);
}

function isValidRupeeAmount(value) {
    return Number.isFinite(value) && value >= 0;
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

function getMealAmount(mealPlan) {
    if (mealPlan === "2_TIMES") return 4000;
    if (mealPlan === "4_TIMES") return 6000;
    return 0;
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
                status: {
                    [Op.in]: ["draft", "payment_reviewed", "payment_confirmed"]
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

    if (items.some(item => item.status !== "Available")) {
        return { error: "Selected set is not fully available", statusCode: 400 };
    }

    const assignedInventory = items.map(item => item.id);

    await releaseInventoryForDraftBooking(draftBooking, transaction);
    await Inventory.update(
        { status: "Allocated" },
        { where: { id: assignedInventory }, transaction }
    );

    draftBooking.assignedItems = assignedInventory;
    await draftBooking.save({ transaction });

    return { assignedInventory };
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
        rentAmount,
        currentMonthRent,
        waiveCurrentMonthRent = false,
        waiveCurrentMonthRentApproval = false,
        securityDepositType,
        securityDepositAmount,
        securityDeposit,
        advanceRent,
        advanceRentAmount,
        amcCharges,
        amcChargeAmount,
        panCardNumber,
        panNumber
    } = payload;

    const depositType = normalizeSecurityDepositType(securityDepositType);
    const errors = [];

    if (!depositType) {
        errors.push("securityDepositType must be 1+1, 1+2 or DYNAMIC");
    }

    const received = toRupees(totalAmountReceived ?? totalAmountReceivedRent);
    const rent = toRupees(rentAmount ?? currentMonthRent);
    const securityInput = securityDepositAmount ?? securityDeposit;
    const security = depositType
        ? getSecurityDepositAmount(depositType, booking.monthlyRent, securityInput)
        : toRupees(securityInput);
    const advance = toRupees(advanceRent ?? advanceRentAmount);
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

    if (depositType === "DYNAMIC" && security <= 0) {
        errors.push("securityDepositAmount is required for Dynamic security deposit");
    }

    if (!isValidRupeeAmount(advance)) {
        errors.push("advanceRent must be a valid amount");
    }

    if (!isValidRupeeAmount(amc)) {
        errors.push("amcCharges must be a valid amount");
    }

    if (waiveCurrentMonthRent && !waiveCurrentMonthRentApproval) {
        errors.push("Waive current month rent needs admin approval");
    }

    if (waiveCurrentMonthRent && rent !== 0) {
        errors.push("rentAmount must be 0 when current month rent is waived");
    }

    const computedTotal = Math.round(rent + security + advance + amc);

    if (Math.round(received) !== computedTotal) {
        errors.push("Total Amount Received must equal Rent + Security Deposit + Advance Rent + AMC Charges");
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
                waiveCurrentMonthRent: Boolean(waiveCurrentMonthRent),
                waiveCurrentMonthRentApproval: Boolean(waiveCurrentMonthRentApproval),
                securityDepositType: depositType,
                securityDepositAmount: Math.round(security),
                advanceRent: Math.round(advance),
                amcCharges: Math.round(amc),
                panCardNumber: finalPanNumber || null
            },
            calculated: {
                rentAmount: Math.round(rent),
                securityDepositAmount: Math.round(security),
                advanceRent: Math.round(advance),
                amcCharges: Math.round(amc),
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
    await ensureDraftTables();
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

        if (!moment(checkInDate, "YYYY-MM-DD", true).isValid()) {
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

        const activeCount = await getRoomReservedCount(roomId, transaction);

        if (activeCount >= room.capacity) {
            await transaction.rollback();
            return res.status(400).json({message: "Room is already full."});
        }

        const checkOutDate = moment(checkInDate)
            .add(normalizedDuration, "months")
            .subtract(1, "day")
            .format("YYYY-MM-DD");

        const overlappingBooking = await RealBooking.findOne({
            where: {
                userId,
                status: {
                    [Op.in]: ["pending", "approved", "active"]
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

        if (overlappingBooking) {
            await transaction.rollback();
            return res.status(400).json({message: "User already has an active booking for this period."});
        }

        const overlappingDraftBooking = await DraftBookingModel.findOne({
            where: {
                userId,
                status: {
                    [Op.in]: ["draft", "payment_reviewed", "payment_confirmed"]
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

        if (overlappingDraftBooking) {
            await transaction.rollback();
            return res.status(400).json({message: "User already has an active draft booking for this period."});
        }

        const finalMonthlyRent =
            monthlyRent !== undefined && monthlyRent !== null
                ? Number(monthlyRent)
                : Number(rateCard.rent ?? room.monthlyRent);

        const mealAmount = rentIncludesMeals ? 0 : getMealAmount(normalizedMealPlan);
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

        const booking = await DraftBookingModel.create(
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

                status: "pending",

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

        if (setNumber !== undefined && setNumber !== null && setNumber !== "") {
            const assignment = await assignInventorySetToDraftBooking(booking, setNumber, transaction);

            if (assignment.error) {
                await transaction.rollback();
                return res.status(assignment.statusCode).json({ message: assignment.error });
            }
        }

        room.status = activeCount + 1 >= room.capacity ? "booked" : "available";
        await room.save({ transaction });

        await transaction.commit();
        await logApiCall(req, res, 201, "Draft booking created successfully", "Draft Booking", booking.id);
        return res.status(201).json({message: "Draft booking created successfully.", booking});
    } catch (err) {
        await transaction.rollback();
        console.error(err);
        await logApiCall(req, res, 500, "Error while creating draft booking", "Draft Booking");
        return res.status(500).json({ message: "Internal server error." });
    }
}

exports.getBookingPaymentFormData = async (req, res) => {
    try {
        await ensureDraftTables();
        const { bookingId } = req.query;

        const bookings = await DraftBookingModel.findAll({
            where: {
                status: {
                    [Op.in]: ["pending", "payment_reviewed", "payment_confirmed"]
                }
            },
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
            ) || await DraftBookingModel.findByPk(bookingId, {
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
        await logApiCall(req, res, 500, "Error while fetching draft booking payment form data", "Draft Booking", req.user?.id || 0);
        return res.status(500).json({ success: false, message: err.message || "Server error" });
    }
};

exports.reviewBookingPayment = async (req, res) => {
    try {
        await ensureDraftTables();
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        const booking = await DraftBookingModel.findByPk(bookingId, {
            include: [
                { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                { model: Property, as: "property", attributes: ["id", "name", "address"] }
            ]
        });

        if (!booking) {
            await logApiCall(req, res, 404, `Reviewed draft booking payment - booking not found (ID: ${bookingId})`, "Draft Booking", req.user?.id || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const { errors, review } = await buildBookingPaymentReview(req.body, booking);

        if (errors.length > 0) {
            await logApiCall(req, res, 400, `Reviewed draft booking payment - validation failed (Booking ID: ${booking.id})`, "Draft Booking", req.user?.id || 0);
            return res.status(400).json({
                success: false,
                message: "Booking payment review validation failed",
                errors,
                review
            });
        }

        await logApiCall(req, res, 200, `Reviewed draft booking payment (Booking ID: ${booking.id})`, "Draft Booking", req.user?.id || 0);
        booking.status = "payment_reviewed";
        booking.meta = {
            ...(booking.meta || {}),
            draftBookingPaymentReview: review,
            reviewedAt: new Date().toISOString(),
            reviewedByAdminId: req.user?.id || null
        };
        await booking.save();

        return res.json({
            success: true,
            message: "Booking payment review validated successfully",
            review
        });
    } catch (err) {
        console.error("[reviewBookingPayment]", err);
        await logApiCall(req, res, 500, "Error while reviewing draft booking payment", "Draft Booking", req.user?.id || 0);
        return res.status(500).json({ success: false, message: err.message || "Server error" });
    }
};

exports.confirmBookingPayment = async (req, res) => {
    await ensureDraftTables();
    const transaction = await sequelize.transaction();

    try {
        const { bookingId, paymentType = "CASH", paymentDate, adminNote } = req.body;
        const adminId = req.user?.id || null;

        if (!bookingId) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        const normalizedPaymentType = String(paymentType).toUpperCase();
        if (!["CASH", "CHEQUE", "UPI"].includes(normalizedPaymentType)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "paymentType must be CASH, CHEQUE or UPI" });
        }

        if (paymentDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "paymentDate must be in DD/MM/YYYY format" });
        }

        const lockedBooking = await DraftBookingModel.findByPk(bookingId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!lockedBooking) {
            await transaction.rollback();
            await logApiCall(req, res, 404, `Confirmed draft booking payment - booking not found (ID: ${bookingId})`, "Draft Booking", adminId || 0);
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (["cancelled", "rejected", "completed"].includes(String(lockedBooking.status || "").toLowerCase())) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Cannot confirm payment for a closed booking" });
        }

        const confirmedTransactionId = lockedBooking.meta?.draftBookingPaymentTransactionId;
        if (confirmedTransactionId) {
            const existingTransaction = await DraftPaymentTransaction.findByPk(confirmedTransactionId, {
                transaction
            });

            await transaction.rollback();
            return res.status(409).json({
                success: false,
                message: "Booking payment is already confirmed",
                transaction: existingTransaction || null,
                booking: lockedBooking
            });
        }

        const existingDraftPayment = await DraftPaymentTransaction.findOne({
            where: {
                draftBookingId: lockedBooking.id,
                status: "SUCCESS",
                type: "OFFLINE",
                merchantOrderId: {
                    [Op.like]: "DRAFT-OFFLINE-%"
                }
            },
            transaction
        });

        if (existingDraftPayment) {
            lockedBooking.meta = {
                ...(lockedBooking.meta || {}),
                draftBookingPaymentTransactionId: existingDraftPayment.id
            };
            await lockedBooking.save({ transaction });
            await transaction.commit();

            return res.status(409).json({
                success: false,
                message: "Booking payment is already confirmed",
                transaction: existingDraftPayment,
                booking: lockedBooking
            });
        }

        const booking = await DraftBookingModel.findByPk(bookingId, {
            include: [
                { model: User, as: "user", attributes: ["id", "fullName", "email", "phone"] },
                { model: Rooms, as: "room", attributes: ["id", "roomNumber", "roomType", "monthlyRent", "depositAmount"] },
                { model: Property, as: "property", attributes: ["id", "name", "address"] }
            ],
            transaction
        });

        const { errors, review } = await buildBookingPaymentReview(req.body, booking, transaction);
        if (errors.length > 0) {
            await transaction.rollback();
            await logApiCall(req, res, 400, `Confirmed draft booking payment - validation failed (Booking ID: ${booking.id})`, "Draft Booking", adminId || 0);
            return res.status(400).json({
                success: false,
                message: "Booking payment confirm validation failed",
                errors,
                review
            });
        }

        const amountReceived = review.calculated.totalAmountReceived;
        const amountPaise = Math.round(amountReceived * 100);

        const paymentTransaction = await DraftPaymentTransaction.create({
            draftBookingId: lockedBooking.id,
            userId: lockedBooking.userId,
            merchantOrderId: `DRAFT-OFFLINE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            amount: amountPaise,
            type: "OFFLINE",
            status: "SUCCESS",
            paymentMode: "OFFLINE",
            offlinePaymentType: normalizedPaymentType,
            createdByAdminId: adminId,
            paymentDate: paymentDate || null,
            rawResponse: {
                manuallyCreated: true,
                createdFrom: "draft-booking-confirm",
                createdAt: new Date().toISOString()
            },
            meta: {
                source: "draft-booking",
                bookingPaymentReview: review,
                acknowledgementRequired: true,
                invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL",
                invoiceNote: "Invoice is generated only after accountant approval"
            }
        }, { transaction });

        const currentRemaining = Number(lockedBooking.remainingAmount || lockedBooking.totalAmount || 0);
        lockedBooking.bookingSource = "OFFLINE";
        lockedBooking.status = "payment_confirmed";
        lockedBooking.remainingAmount = Math.max(Math.round(currentRemaining - amountReceived), 0);
        lockedBooking.paymentStatus = lockedBooking.remainingAmount === 0 ? "COMPLETED" : "PARTIAL";

        if (review.calculated.securityDepositAmount > 0) {
            lockedBooking.securityDepositPaid = true;
        }

        lockedBooking.meta = {
            ...(lockedBooking.meta || {}),
            draftBookingPayment: review,
            invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL",
            invoiceGstApplicable: review.calculated.gstApplicableOnInvoice,
            confirmedByAdminId: adminId,
            confirmedAt: new Date().toISOString(),
            draftBookingPaymentTransactionId: paymentTransaction.id
        };

        await lockedBooking.save({ transaction });
        await transaction.commit();

        const acknowledgementSent = false;

        await logApiCall(req, res, 201, `Confirmed draft booking payment (Booking ID: ${lockedBooking.id}, Transaction ID: ${paymentTransaction.id})`, "Draft Booking", lockedBooking.id);
        return res.status(201).json({
            success: true,
            message: "Booking payment confirmed successfully",
            booking: lockedBooking,
            transaction: paymentTransaction,
            acknowledgementSent,
            invoiceStatus: "PENDING_ACCOUNTANT_APPROVAL"
        });
    } catch (err) {
        await transaction.rollback();
        console.error("[confirmBookingPayment]", err);
        await logApiCall(req, res, 500, "Error while confirming draft booking payment", "Draft Booking", req.user?.id || 0);
        return res.status(500).json({ success: false, message: err.message || "Server error" });
    }
};
