const User = require("../models/user");
const Rooms = require("../models/rooms");
const Booking = require("../models/bookRoom");
const PaymentTransaction = require("../models/paymentTransaction");
const SupportTicket = require("../models/supportTicket");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const { logApiCall } = require("../helpers/auditLog");
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
    const totalUsers = await User.count({where:{role:{[Op.in]:[2]}}});

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

    // 7. Count of available rooms
    const allRoomsWithBookings = await Rooms.findAll({
      attributes: ["id", "capacity", "status"],
      include: [
        {
          model: Booking,
          as: "bookings",
          where: {
            status: { [Op.in]: ["pending", "approved", "active"] },
          },
          required: false,
        },
      ],
    });

    const availableRoomsCount = allRoomsWithBookings.filter((room) => {
      const bookingsCount = room.bookings?.length || 0;
      return (
        room.status !== "unavailable" &&
        bookingsCount < (room.capacity || 0)
      );
    }).length;

    res.status(200).json({
      message: "Dashboard stats fetched successfully",
      totalUsers,
      occupancyRate: parseFloat(occupancyRate),
      pendingBookings,
      monthlyRevenue: Math.max(0, monthlyRevenue),
      supportTickets: {
        activeTickets: openedTickets,
        resolvedTickets: resolvedTickets,
      },
      pendingActions: {
        availableRooms: availableRoomsCount,
      },
    });
    await logApiCall(req, res, 200, "Viewed dashboard stats", "dashboard");
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching dashboard stats", "dashboard");
    res.status(500).json({
      message: "Error occurred while fetching dashboard stats",
      error: error.message,
    });
  }
};

exports.getReport = async (req, res) => {
  try {
    const { timeline = "30" } = req.query;

    // IST Offset: +5:30 (5.5 hours)
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const nowUTC = new Date();
    const now = new Date(nowUTC.getTime() + IST_OFFSET);

    let startDate;
    let interval = "day"; // day, week, month
    let dataPoints = 0;

    if (timeline === "7") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      interval = "day";
      dataPoints = 7;
    } else if (timeline === "30") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      interval = "day";
      dataPoints = 30;
    } else if (timeline === "90") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      interval = "week";
      dataPoints = 13;
    } else if (timeline === "365") {
      startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
      startDate.setHours(0, 0, 0, 0);
      interval = "month";
      dataPoints = 12;
    } else {
      // Default to 30 days
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      interval = "day";
      dataPoints = 30;
    }

    // 1. Stats based on timeline
    const revenueWhere = {
      status: "SUCCESS",
      createdAt: { [Op.between]: [startDate, now] },
    };

    const revenueResult = await PaymentTransaction.findAll({
      attributes: [
        [sequelize.fn("SUM", sequelize.literal("CASE WHEN type != 'REFUND' THEN amount ELSE 0 END")), "totalRevenue"],
        [sequelize.fn("SUM", sequelize.literal("CASE WHEN type = 'REFUND' THEN amount ELSE 0 END")), "totalRefund"],
      ],
      where: revenueWhere,
      raw: true,
    });

    const totalRevenuePaise = parseInt(revenueResult[0]?.totalRevenue || 0);
    const totalRefundPaise = parseInt(revenueResult[0]?.totalRefund || 0);
    const timelineRevenue = (totalRevenuePaise - totalRefundPaise) / 100;

    const totalUsers = await User.count({
      where: {
        role: { [Op.in]: [2] },
        createdAt: { [Op.between]: [startDate, now] },
      },
    });

    const openedTickets = await SupportTicket.count({
      where: {
        status: "open",
        createdAt: { [Op.between]: [startDate, now] },
      },
    });

    // Global Current Occupancy (Approved only, Today between check-in and check-out)
    const todayStr = now.toISOString().split('T')[0];
    const allRooms = await Rooms.findAll({ attributes: ["id", "capacity"] });
    const currentActiveBookings = await Booking.findAll({
      where: {
        status: "approved",
        roomId: { [Op.ne]: null },
        checkInDate: { [Op.lte]: todayStr },
        checkOutDate: { [Op.gte]: todayStr }
      },
    });

    let totalBeds = 0;
    let occupiedBeds = 0;
    allRooms.forEach((room) => {
      totalBeds += room.capacity || 0;
      const roomBookings = currentActiveBookings.filter((b) => b.roomId === room.id).length;
      occupiedBeds += Math.min(roomBookings, room.capacity || 0);
    });
    const currentOccupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(2) : 0;

    // 2. Trend Data Generation (Optimized with Bulk Fetching)
    const allTransactions = await PaymentTransaction.findAll({
      where: {
        status: "SUCCESS",
        createdAt: { [Op.between]: [startDate, now] },
      },
      attributes: ["amount", "type", "createdAt"],
      raw: true,
    });

    const allTimelineBookings = await Booking.findAll({
      where: {
        status: "approved",
        roomId: { [Op.ne]: null },
        checkInDate: { [Op.lte]: now },
        checkOutDate: { [Op.gte]: startDate }
      },
      attributes: ["id", "roomId", "checkInDate", "checkOutDate"],
      raw: true,
    });

    const graphRevenue = [];
    const graphOccupancy = [];

    // Helper for date string key to group
    const getDateKey = (date, interval) => {
      const d = new Date(date);
      if (interval === "day" || interval === "week") {
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      } else {
        return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      }
    };

    for (let i = 0; i < dataPoints; i++) {
      let dStart, dEnd, label;

      if (interval === "day") {
        dStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i, 0, 0, 0, 0);
        dEnd = new Date(dStart);
        dEnd.setHours(23, 59, 59, 999);
      } else if (interval === "week") {
        dStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i * 7, 0, 0, 0, 0);
        dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 6);
        dEnd.setHours(23, 59, 59, 999);
      } else if (interval === "month") {
        dStart = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1, 0, 0, 0, 0);
        dEnd = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      if (dStart > now) break;
      label = getDateKey(dStart, interval);

      // Aggregate Revenue
      const periodTransactions = allTransactions.filter(t => {
        const tDate = new Date(t.createdAt);
        return tDate >= dStart && tDate <= dEnd;
      });

      let pRevPaise = 0;
      let pRefPaise = 0;
      periodTransactions.forEach(t => {
        const amt = parseInt(t.amount || 0);
        if (t.type === 'REFUND') pRefPaise += amt;
        else pRevPaise += amt;
      });

      graphRevenue.push({
        month: label,
        revenue: Math.max(0, (pRevPaise - pRefPaise) / 100),
      });

      // Aggregate Occupancy
      let pOccupied = 0;
      const periodBookings = allTimelineBookings.filter(b => {
        const bIn = new Date(b.checkInDate);
        const bOut = b.checkOutDate ? new Date(b.checkOutDate) : null;
        return bIn <= dEnd && (!bOut || bOut >= dStart);
      });

      allRooms.forEach(room => {
        const roomBookings = periodBookings.filter(b => b.roomId === room.id).length;
        pOccupied += Math.min(roomBookings, room.capacity || 0);
      });

      const pOccupancyRate = totalBeds > 0 ? ((pOccupied / totalBeds) * 100).toFixed(2) : 0;
      graphOccupancy.push({
        month: label,
        occupancyRate: parseFloat(pOccupancyRate),
      });
    }
    const mergedGraphData = graphRevenue.map((rev, index) => ({
      period: rev.month,
      revenue: rev.revenue,
      occupancyRate: graphOccupancy[index]?.occupancyRate || 0,
    }));
    res.status(200).json({
      message: "Report fetched successfully",
      completeRevenue: Math.max(0, timelineRevenue),
      totalUsers,
      occupancyRate: parseFloat(currentOccupancyRate),
      openedTickets,
      monthlyGraphData: {
        revenue: graphRevenue,
        roomOccupancy: graphOccupancy,
      },
      reportTable: mergedGraphData,
    });
    await logApiCall(req, res, 200, "Viewed report data with timeline: " + timeline, "dashboard");
  } catch (error) {
    console.error("Error fetching report:", error);
    await logApiCall(req, res, 500, "Error occurred while fetching report", "dashboard");
    res.status(500).json({
      message: "Error occurred while fetching report",
      error: error.message,
    });
  }
};
