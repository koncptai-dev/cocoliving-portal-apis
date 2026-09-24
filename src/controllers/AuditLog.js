const AuditLog = require("../models/auditLog");
const User = require("../models/user");
const { logApiCall } = require("../helpers/auditLog");
const { Op } = require("sequelize");

exports.getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      type,
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);
    const offset = (pageNumber - 1) * limitNumber;

    const where = {};

    if (role) {
      where.role = role;
    }

    if (startDate || endDate) {
      where.createdAt = {};

      if (startDate) {
        where.createdAt[Op.gte] = new Date(`${startDate}T00:00:00.000`);
      }

      if (endDate) {
        where.createdAt[Op.lte] = new Date(`${endDate}T23:59:59.999`);
      }
    }

    const validSortOrder =
      String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";

    let order;

    // Sort by current user's full name
    if (sortBy === "name") {
      order = [
        [
          {
            model: User,
            as: "user",
          },
          "fullName",
          validSortOrder,
        ],
      ];
    } else {
      // Default: sort by audit log date
      order = [["createdAt", validSortOrder]];
    }

    const userWhere = {};
    if (type) {
      if (type === "admin") {
        userWhere.role = {
          [Op.in]: [1, 3],
        };
      } else if (type === "user") {
        userWhere.role = 2;
      }
    }

    const { count, rows: auditLogs } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName"],
          where: userWhere,
        },
      ],
      order,
      limit: limitNumber,
      offset,
      distinct: true,
    });

    const formattedAuditLogs = auditLogs.map((log) => {
      const data = log.toJSON();

      return {
        ...data,
        fullName: data.user?.fullName || null,
        user: undefined,
      };
    });

    await logApiCall(
      req,
      res,
      200,
      "Viewed audit logs list",
      "auditLog"
    );

    return res.status(200).json({
      message: "Audit logs fetched successfully",
      auditLogs: formattedAuditLogs,
      pagination: {
        currentPage: pageNumber,
        limit: limitNumber,
        totalRecords: count,
        totalPages: Math.ceil(count / limitNumber),
        hasNextPage: pageNumber < Math.ceil(count / limitNumber),
        hasPreviousPage: pageNumber > 1,
      },
    });
  } catch (error) {
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while fetching audit logs",
      "auditLog"
    );
    return res.status(500).json({
      message: "Failed to get audit logs",
      error: error.message,
    });
  }
};
