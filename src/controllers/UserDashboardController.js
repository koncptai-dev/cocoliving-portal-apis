const Booking = require("../models/bookRoom");
const Rooms = require("../models/rooms");
const Property = require("../models/property");
const PropertyRateCard = require("../models/propertyRateCard");
const { logApiCall } = require("../helpers/auditLog");
require("../models/index");

exports.getUserDashboard = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      await logApiCall(req, res, 401, "Viewed user dashboard - unauthorized", "dashboard");
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

    await logApiCall(req, res, 200, "Viewed user dashboard", "dashboard", userId);
    res.status(200).json({
      bookings: formattedBookings,
    });
  } catch (error) {
    console.error("Error fetching user dashboard:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching user dashboard", "dashboard", req.user?.id || 0);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

