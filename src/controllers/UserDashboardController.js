const Booking = require("../models/bookRoom");
const Rooms = require("../models/rooms");
const Property = require("../models/property");
const PropertyRateCard = require("../models/propertyRateCard");
const PaymentTransaction = require("../models/paymentTransaction");
const { logApiCall } = require("../helpers/auditLog");
require("../models/index");

exports.getUserDashboard = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      await logApiCall(
        req,
        res,
        401,
        "Viewed user dashboard - unauthorized",
        "dashboard"
      );
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.id;

    const bookings = await Booking.findAll({
      where: { userId },
      include: [
        {
          model: Rooms,
          as: "room",
          include: [
            {
              model: Property,
              as: "property",
              attributes: [
                "id",
                "name",
                "address",
                "description",
                "images",
                "amenities",
              ],
            },
          ],
        },
        {
          model: PropertyRateCard,
          as: "rateCard",
          include: [
            {
              model: Property,
              as: "property",
              attributes: [
                "id",
                "name",
                "address",
                "description",
                "images",
                "amenities",
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formattedBookings = bookings.map((booking) => {
      const bookingData = booking.toJSON();
      return {
        id: bookingData.id,
        propertyId: bookingData.propertyId,
        userId: bookingData.userId,
        rateCardId: bookingData.rateCardId,
        roomType: bookingData.roomType,
        roomId: bookingData.roomId,
        assignedItems: bookingData.assignedItems,
        checkInDate: bookingData.checkInDate,
        checkOutDate: bookingData.checkOutDate,
        duration: bookingData.duration,
        monthlyRent: bookingData.monthlyRent,
        status: bookingData.status,
        totalAmount: bookingData.totalAmount,
        remainingAmount: bookingData.remainingAmount,
        bookingType: bookingData.bookingType,
        paymentStatus: bookingData.paymentStatus,
        meta: bookingData.meta,
        createdAt: bookingData.createdAt,
        updatedAt: bookingData.updatedAt,
        room: bookingData.room
          ? {
              id: bookingData.room.id,
              propertyId: bookingData.room.propertyId,
              roomNumber: bookingData.room.roomNumber,
              roomType: bookingData.room.roomType,
              capacity: bookingData.room.capacity,
              floorNumber: bookingData.room.floorNumber,
              monthlyRent: bookingData.room.monthlyRent,
              depositAmount: bookingData.room.depositAmount,
              preferredUserType: bookingData.room.preferredUserType,
              description: bookingData.room.description,
              status: bookingData.room.status,
              property: bookingData.room.property,
            }
          : null,
        rateCard: bookingData.rateCard
          ? {
              id: bookingData.rateCard.id,
              propertyId: bookingData.rateCard.propertyId,
              roomType: bookingData.rateCard.roomType,
              roomAmenities: bookingData.rateCard.roomAmenities,
              roomImages: bookingData.rateCard.roomImages,
              rent: bookingData.rateCard.rent,
              property: bookingData.rateCard.property,
            }
          : null,
      };
    });

    // Fetch recent payment transactions
    const recentPayments = await PaymentTransaction.findAll({
      where: { userId },
      include: [
        {
          model: Booking,
          as: "booking",
          attributes: [
            "id",
            "propertyId",
            "roomType",
            "checkInDate",
            "checkOutDate",
            "status",
            "totalAmount",
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 10, // Get last 10 payments
    });

    const formattedPayments = recentPayments.map((payment) => {
      const paymentData = payment.toJSON();
      const amountPaise = Number(paymentData.amount || 0);
      return {
        id: paymentData.id,
        merchantOrderId: paymentData.merchantOrderId,
        merchantRefundId: paymentData.merchantRefundId || null,
        phonepeOrderId:
          paymentData.phonepeOrderId ||
          (paymentData.rawResponse &&
            paymentData.rawResponse.phonepeCreateResponse &&
            paymentData.rawResponse.phonepeCreateResponse.body &&
            paymentData.rawResponse.phonepeCreateResponse.body.orderId) ||
          null,
        bookingId: paymentData.bookingId || null,
        amountPaise,
        amountRupees: Math.round(amountPaise / 100),
        type: paymentData.type,
        status: paymentData.status,
        createdAt: paymentData.createdAt,
        updatedAt: paymentData.updatedAt,
        booking: paymentData.booking
          ? {
              id: paymentData.booking.id,
              propertyId: paymentData.booking.propertyId,
              roomType: paymentData.booking.roomType,
              checkInDate: paymentData.booking.checkInDate,
              checkOutDate: paymentData.booking.checkOutDate,
              status: paymentData.booking.status,
              totalAmount: paymentData.booking.totalAmount,
            }
          : null,
      };
    });

    await logApiCall(
      req,
      res,
      200,
      "Viewed user dashboard",
      "dashboard",
      userId
    );
    res.status(200).json({
      message: "User dashboard fetched successfully",
      bookings: formattedBookings,
      recentPayments: formattedPayments,
    });
  } catch (error) {
    console.error("Error fetching user dashboard:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while fetching user dashboard",
      "dashboard",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while fetching user dashboard",
      error: error.message,
    });
  }
};
