const User = require("../models/user");
const Rooms = require("../models/rooms");
const Booking = require("../models/bookRoom");
const PaymentTransaction = require("../models/paymentTransaction");
const SupportTicket = require("../models/supportTicket");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
require("../models/index");

exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // 1. Total user count
    const totalUsers = await User.count();

    // 2. Occupancy rate - percentage of occupied beds out of total beds (all bookings)
    const allRooms = await Rooms.findAll({
      attributes: ["id", "capacity"],
    });

    const allBookings = await Booking.findAll({
      where: {
        status: { [Op.in]: ["approved", "active"] },
        roomId: { [Op.ne]: null },
      },
      attributes: ["id", "roomId"],
    });

    let totalBeds = 0;
    let occupiedBeds = 0;

    allRooms.forEach((room) => {
      totalBeds += room.capacity || 0;
      const roomBookings = allBookings.filter(
        (b) => b.roomId === room.id
      ).length;
      occupiedBeds += Math.min(roomBookings, room.capacity || 0);
    });

    const occupancyRate =
      totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(2) : 0;

    // 3. Count of pending bookings
    const pendingBookings = await Booking.count({
      where: { status: "pending" },
    });

    // 4. Monthly revenue (total current month revenue - refund amount of this month)
    const monthlyRevenueResult = await PaymentTransaction.findAll({
      attributes: [
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(
              "CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
            )
          ),
          "totalRevenue",
        ],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(
              "CASE WHEN type = 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
            )
          ),
          "totalRefund",
        ],
      ],
      where: {
        createdAt: {
          [Op.between]: [startOfMonth, endOfMonth],
        },
      },
      raw: true,
    });

    const totalRevenuePaise = parseInt(
      monthlyRevenueResult[0]?.totalRevenue || 0
    );
    const totalRefundPaise = parseInt(
      monthlyRevenueResult[0]?.totalRefund || 0
    );
    const monthlyRevenue = (totalRevenuePaise - totalRefundPaise) / 100;

    // 5. Total opened tickets count
    const openedTickets = await SupportTicket.count({
      where: { status: "open" },
    });

    // 6. Total resolved tickets count
    const resolvedTickets = await SupportTicket.count({
      where: { status: "resolved" },
    });

    res.status(200).json({
      totalUsers,
      occupancyRate: parseFloat(occupancyRate),
      pendingBookings,
      monthlyRevenue: Math.max(0, monthlyRevenue),
      supportTickets: {
        activeTickets: openedTickets,
        resolvedTickets: resolvedTickets,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getReport = async (req, res) => {
  try {
    // 1. Complete revenue (all time revenue - all time refunds)
    const completeRevenueResult = await PaymentTransaction.findAll({
      attributes: [
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(
              "CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
            )
          ),
          "totalRevenue",
        ],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(
              "CASE WHEN type = 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
            )
          ),
          "totalRefund",
        ],
      ],
      raw: true,
    });

    const totalRevenuePaise = parseInt(
      completeRevenueResult[0]?.totalRevenue || 0
    );
    const totalRefundPaise = parseInt(
      completeRevenueResult[0]?.totalRefund || 0
    );
    const completeRevenue = (totalRevenuePaise - totalRefundPaise) / 100;

    // 2. Total users count
    const totalUsers = await User.count();

    // 3. Complete occupancy rate
    const allRooms = await Rooms.findAll({
      attributes: ["id", "capacity"],
    });

    const allBookings = await Booking.findAll({
      where: {
        status: { [Op.in]: ["approved", "active"] },
        roomId: { [Op.ne]: null },
      },
      attributes: ["id", "roomId"],
    });

    let totalBeds = 0;
    let occupiedBeds = 0;

    allRooms.forEach((room) => {
      totalBeds += room.capacity || 0;
      const roomBookings = allBookings.filter(
        (b) => b.roomId === room.id
      ).length;
      occupiedBeds += Math.min(roomBookings, room.capacity || 0);
    });

    const occupancyRate =
      totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(2) : 0;

    // 4. Total opened tickets
    const openedTickets = await SupportTicket.count({
      where: { status: "open" },
    });

    // 5. Monthly graph data for revenue (last 12 months)
    const now = new Date();
    const monthlyRevenueData = [];

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        1
      );
      const endOfMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0,
        23,
        59,
        59
      );

      const monthRevenueResult = await PaymentTransaction.findAll({
        attributes: [
          [
            sequelize.fn(
              "SUM",
              sequelize.literal(
                "CASE WHEN type != 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
              )
            ),
            "totalRevenue",
          ],
          [
            sequelize.fn(
              "SUM",
              sequelize.literal(
                "CASE WHEN type = 'REFUND' AND status = 'SUCCESS' THEN amount ELSE 0 END"
              )
            ),
            "totalRefund",
          ],
        ],
        where: {
          createdAt: {
            [Op.between]: [startOfMonth, endOfMonth],
          },
        },
        raw: true,
      });

      const monthRevenuePaise = parseInt(
        monthRevenueResult[0]?.totalRevenue || 0
      );
      const monthRefundPaise = parseInt(
        monthRevenueResult[0]?.totalRefund || 0
      );
      const monthRevenue = (monthRevenuePaise - monthRefundPaise) / 100;

      monthlyRevenueData.push({
        month: monthDate.toLocaleString("default", {
          month: "short",
          year: "numeric",
        }),
        revenue: Math.max(0, monthRevenue),
      });
    }

    // 6. Monthly graph data for room occupancy (last 12 months)
    const monthlyOccupancyData = [];

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        1
      );
      const endOfMonth = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0
      );

      // Get bookings that were active during this month
      const monthBookings = await Booking.findAll({
        where: {
          status: { [Op.in]: ["approved", "active"] },
          roomId: { [Op.ne]: null },
          checkInDate: { [Op.lte]: endOfMonth },
          checkOutDate: { [Op.gte]: startOfMonth },
        },
        attributes: ["id", "roomId"],
      });

      let monthTotalBeds = 0;
      let monthOccupiedBeds = 0;

      allRooms.forEach((room) => {
        monthTotalBeds += room.capacity || 0;
        const roomBookings = monthBookings.filter(
          (b) => b.roomId === room.id
        ).length;
        monthOccupiedBeds += Math.min(roomBookings, room.capacity || 0);
      });

      const monthOccupancyRate =
        monthTotalBeds > 0
          ? ((monthOccupiedBeds / monthTotalBeds) * 100).toFixed(2)
          : 0;

      monthlyOccupancyData.push({
        month: monthDate.toLocaleString("default", {
          month: "short",
          year: "numeric",
        }),
        occupancyRate: parseFloat(monthOccupancyRate),
      });
    }

    res.status(200).json({
      completeRevenue: Math.max(0, completeRevenue),
      totalUsers,
      occupancyRate: parseFloat(occupancyRate),
      openedTickets,
      monthlyGraphData: {
        revenue: monthlyRevenueData,
        roomOccupancy: monthlyOccupancyData,
      },
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
