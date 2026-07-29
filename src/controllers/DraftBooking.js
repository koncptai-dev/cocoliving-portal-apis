const moment = require("moment");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const { Property, Rooms, PropertyRateCard, User, Booking } = require("../models");
const PaymentTransaction = require("../models/paymentTransaction");
const UserKYC = require("../models/userKYC");
const { logApiCall } = require("../helpers/auditLog");
const { generateAndSendAcknowledgementReceipt } = require("../utils/acknowledgementReceiptService");

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

exports.getFormData=async(req,res)=>{
    try {
        const properties = await Property.findAll({
            attributes: ["id", "name", "address"],
            include: [
                {
                    model: Rooms,
                    as: "rooms",
                    attributes: [
                        "id",
                        "roomNumber",
                        "roomType",
                        "capacity",
                        "floorNumber",
                        "monthlyRent",
                        "depositAmount",
                        "status"
                    ],
                    where: {
                        status: "available"
                    },
                    required: false
                },
                {
                    model: PropertyRateCard,
                    as: "rateCard",
                    attributes: [
                        "id",
                        "roomType",
                        "rent"
                    ],
                    required: false
                }
            ]
        });

        const users = await User.findAll({
            attributes: ["id", "fullName", "email", "phone"],
            order: [["fullName", "ASC"]]
        });

        const formattedProperties = properties.map(property => ({
            id: property.id,
            name: property.name,
            address: property.address,
            rooms: (property.rooms || []).map(room => {

                const rateCard = (property.rateCard || []).find(
                    rate => rate.roomType === room.roomType
                );

                return {
                    id: room.id,
                    roomNumber: room.roomNumber,
                    roomType: room.roomType,
                    capacity: room.capacity,
                    floorNumber: room.floorNumber,
                    depositAmount: room.depositAmount,
                    status: room.status,

                    monthlyRent: rateCard
                        ? rateCard.rent
                        : room.monthlyRent
                };
            })
        }));

        await logApiCall(req, res, 200, "Fetched draft booking form data", "Draft Booking");

        return res.status(200).json({properties: formattedProperties, users});

    } catch (err) {
        console.error(err);
        await logApiCall(req, res, 500, "Error occurred while fetching draft booking form data", "Draft Booking");
        return res.status(500).json({message: "Internal server error"});
    }
}

exports.draftBooking=async(req,res)=>{
    const transaction = await sequelize.transaction();

    try {
        const {propertyId, roomId, userId, checkInDate, duration, bookingType, bookingSource = "OFFLINE", monthlyRent} = req.body;

        if (!propertyId || !roomId || !userId || !checkInDate || !duration || !bookingType) {
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
        if (!Number.isInteger(normalizedDuration) || normalizedDuration <= 0) {
            await transaction.rollback();
            return res.status(400).json({message: "duration must be a positive integer."});
        }

        if (!moment(checkInDate, "YYYY-MM-DD", true).isValid()) {
            await transaction.rollback();
            return res.status(400).json({message: "checkInDate must be in YYYY-MM-DD format."});
        }

        if (
            monthlyRent !== undefined &&
            monthlyRent !== null &&
            (Number.isNaN(Number(monthlyRent)) || Number(monthlyRent) <= 0)
        ) {
            await transaction.rollback();
            return res.status(400).json({message: "monthlyRent must be a positive number."});
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

        const activeCount = await Booking.count({
            where: {
                roomId,
                status: {
                    [Op.in]: ["pending", "approved", "active"]
                }
            },
            transaction
        });

        if (activeCount >= room.capacity) {
            await transaction.rollback();
            return res.status(400).json({message: "Room is already full."});
        }

        const checkOutDate = moment(checkInDate)
            .add(normalizedDuration, "months")
            .subtract(1, "day")
            .format("YYYY-MM-DD");

        const overlappingBooking = await Booking.findOne({
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

        const finalMonthlyRent =
            monthlyRent !== undefined && monthlyRent !== null
                ? Number(monthlyRent)
                : Number(rateCard.rent ?? room.monthlyRent);
        const securityDeposit = Number(room.depositAmount ?? finalMonthlyRent * 2);
        const totalAmount = Math.round(finalMonthlyRent * normalizedDuration + securityDeposit);

        const booking = await Booking.create(
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

                monthlyRent: finalMonthlyRent,

                totalAmount,
                remainingAmount: totalAmount,

                status: "pending",

                paymentStatus: "INITIATED",
                onboardingStatus: "NOT_INITIATED",
                contractStatus: "NOT_SIGNED",
                adminContractStatus: "NOT_SIGNED",
                assignedItems: [],

                meta: {}
            },
            {
                transaction
            }
        );

        room.status = activeCount + 1 >= room.capacity ? "booked" : "available";
        await room.save({ transaction });

        await transaction.commit();
        await logApiCall(req, res, 201, "Draft booking created successfully", "Booking", booking.id);
        return res.status(201).json({message: "Booking created successfully.", booking});
    } catch (err) {
        await transaction.rollback();
        console.error(err);
        await logApiCall(req, res, 500, "Error while creating booking", "Booking");
        return res.status(500).json({ message: "Internal server error." });
    }
}

exports.getBookingPaymentFormData = async (req, res) => {
    try {
        const { bookingId } = req.query;

        const bookings = await Booking.findAll({
            where: {
                status: {
                    [Op.in]: ["pending", "approved", "active"]
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
            ) || await Booking.findByPk(bookingId, {
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

            const transactions = await PaymentTransaction.findAll({
                where: {
                    bookingId: selectedBooking.id,
                    status: "SUCCESS",
                    type: {
                        [Op.ne]: "REFUND"
                    }
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
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: "bookingId is required" });
        }

        const booking = await Booking.findByPk(bookingId, {
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

        const lockedBooking = await Booking.findByPk(bookingId, {
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
            const existingTransaction = await PaymentTransaction.findByPk(confirmedTransactionId, {
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

        const existingDraftPayment = await PaymentTransaction.findOne({
            where: {
                bookingId: lockedBooking.id,
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

        const booking = await Booking.findByPk(bookingId, {
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

        const paymentTransaction = await PaymentTransaction.create({
            bookingId: lockedBooking.id,
            userId: lockedBooking.userId,
            merchantOrderId: `DRAFT-OFFLINE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            amount: amountPaise,
            type: "OFFLINE",
            status: "SUCCESS",
            paymentMode: "OFFLINE",
            offlinePaymentType: normalizedPaymentType,
            adminNote: adminNote || null,
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

        const acknowledgementSent = await generateAndSendAcknowledgementReceipt(paymentTransaction);

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
