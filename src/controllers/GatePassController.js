const GatePass = require("../models/gatePass");
const User = require("../models/user");
const { Op } = require("sequelize");
const { logApiCall } = require("../helpers/auditLog");
require("../models/index");

// Create gate pass request
exports.createGatePass = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestType, date, time, reason } = req.body;

    // Validation
    if (!requestType || !date || !time || !reason) {
      await logApiCall(
        req,
        res,
        400,
        "Failed to create gate pass - missing required fields",
        "gatePass"
      );
      return res.status(400).json({
        message:
          "Please provide all required fields: requestType, date, time, reason",
      });
    }

    // Validate date is not in the past
    const requestDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    requestDate.setHours(0, 0, 0, 0);

    if (requestDate < today) {
      await logApiCall(
        req,
        res,
        400,
        "Failed to create gate pass - date cannot be in the past",
        "gatePass"
      );
      return res.status(400).json({
        message: "Date cannot be in the past",
      });
    }

    const gatePass = await GatePass.create({
      userId,
      requestType,
      date,
      time,
      reason,
      status: "pending",
    });

    await logApiCall(
      req,
      res,
      201,
      `Created gate pass request (ID: ${gatePass.id})`,
      "gatePass",
      userId
    );

    res.status(201).json({
      message: "Gate pass request created successfully",
      gatePass,
    });
  } catch (error) {
    console.error("Error creating gate pass:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while creating gate pass",
      "gatePass"
    );
    res.status(500).json({
      message: "Error occurred while creating gate pass",
      error: error.message,
    });
  }
};

// Update gate pass request (only by the user who created it, and only if status is pending)
exports.updateGatePass = async (req, res) => {
  try {
    const userId = req.user.id;
    const gatePassId = req.params.id;
    const { requestType, date, time, reason } = req.body;

    const gatePass = await GatePass.findByPk(gatePassId);

    if (!gatePass) {
      await logApiCall(
        req,
        res,
        404,
        `Failed to update gate pass - not found (ID: ${gatePassId})`,
        "gatePass",
        userId
      );
      return res.status(404).json({ message: "Gate pass not found" });
    }

    // Check if user owns this gate pass
    if (gatePass.userId !== userId) {
      await logApiCall(
        req,
        res,
        403,
        `Failed to update gate pass - unauthorized (ID: ${gatePassId})`,
        "gatePass",
        userId
      );
      return res.status(403).json({
        message: "You are not authorized to update this gate pass",
      });
    }

    // Check if status is pending (can only edit pending requests)
    if (gatePass.status !== "pending") {
      await logApiCall(
        req,
        res,
        400,
        `Failed to update gate pass - cannot edit approved/rejected request (ID: ${gatePassId})`,
        "gatePass",
        userId
      );
      return res.status(400).json({
        message: "You can only edit pending gate pass requests",
      });
    }

    // Update fields if provided
    if (requestType !== undefined) {
      gatePass.requestType = requestType;
    }

    if (date !== undefined) {
      // Validate date is not in the past
      const requestDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      requestDate.setHours(0, 0, 0, 0);

      if (requestDate < today) {
        return res.status(400).json({
          message: "Date cannot be in the past",
        });
      }
      gatePass.date = date;
    }

    if (time !== undefined) {
      gatePass.time = time;
    }

    if (reason !== undefined) {
      gatePass.reason = reason;
    }

    await gatePass.save();

    await logApiCall(
      req,
      res,
      200,
      `Updated gate pass (ID: ${gatePassId})`,
      "gatePass",
      userId
    );

    res.status(200).json({
      message: "Gate pass updated successfully",
      gatePass,
    });
  } catch (error) {
    console.error("Error updating gate pass:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while updating gate pass",
      "gatePass",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while updating gate pass",
      error: error.message,
    });
  }
};

// Get user's own gate passes
exports.getUserGatePasses = async (req, res) => {
  try {
    const userId = req.user.id;

    const gatePasses = await GatePass.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    await logApiCall(
      req,
      res,
      200,
      "Viewed user gate passes list",
      "gatePass",
      userId
    );

    res.status(200).json({
      message: "User gate passes fetched successfully",
      gatePasses,
    });
  } catch (error) {
    console.error("Error fetching user gate passes:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while fetching user gate passes",
      "gatePass",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while fetching gate passes",
      error: error.message,
    });
  }
};

// Get children's gate passes (for parent)
exports.getAllGatePasses = async (req, res) => {
  try {
    const parentEmail = req.user.email;

    // Check if user is a parent (loginAs === "parent" or has children)
    const children = await User.findAll({
      where: { parentEmail: parentEmail },
      attributes: ["id"],
    });

    // If not a parent (no children found and not logged in as parent)
    if (children.length === 0) {
      await logApiCall(
        req,
        res,
        403,
        "Failed to view children gate passes - not a parent",
        "gatePass",
        req.user?.id || 0
      );
      return res.status(403).json({
        message: "You are not authorized to view children's gate passes",
      });
    }

    // Get children's user IDs
    const childrenIds = children.map((child) => child.id);

    // If no children, return empty array
    if (childrenIds.length === 0) {
      await logApiCall(
        req,
        res,
        200,
        "Viewed children gate passes list - no children",
        "gatePass",
        req.user?.id || 0
      );
      return res.status(200).json({
        message: "Children's gate passes fetched successfully",
        gatePasses: [],
      });
    }

    const gatePasses = await GatePass.findAll({
      where: {
        userId: { [Op.in]: childrenIds },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "phone"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    await logApiCall(
      req,
      res,
      200,
      "Viewed children gate passes list",
      "gatePass",
      req.user?.id || 0
    );

    res.status(200).json({
      message: "Children's gate passes fetched successfully",
      gatePasses,
    });
  } catch (error) {
    console.error("Error fetching children's gate passes:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while fetching children's gate passes",
      "gatePass",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while fetching gate passes",
      error: error.message,
    });
  }
};

// Get all gate passes (for admin)
exports.getAdminGatePasses = async (req, res) => {
  try {
    const gatePasses = await GatePass.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: {
            exclude: ["password", "resetCode", "registrationToken", "fcmToken"],
          },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    await logApiCall(
      req,
      res,
      200,
      "Viewed all gate passes list (admin)",
      "gatePass",
      req.user?.id || 0
    );

    res.status(200).json({
      message: "All gate passes fetched successfully",
      gatePasses,
    });
  } catch (error) {
    console.error("Error fetching all gate passes:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while fetching all gate passes",
      "gatePass",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while fetching gate passes",
      error: error.message,
    });
  }
};

// Approve or reject gate pass (parent only)
exports.approveOrRejectGatePass = async (req, res) => {
  try {
    const parentEmail = req.user.email;
    const gatePassId = req.params.id;
    const { status } = req.body;

    // Check if user is a parent
    const children = await User.findAll({
      where: { parentEmail: parentEmail },
      attributes: ["id"],
    });

    // If not a parent (no children found and not logged in as parent)
    if (children.length === 0) {
      await logApiCall(
        req,
        res,
        403,
        "Failed to approve/reject gate pass - not a parent",
        "gatePass",
        req.user?.id || 0
      );
      return res.status(403).json({
        message: "You are not authorized to approve or reject gate passes",
      });
    }

    // Validate status
    if (!status || !["approved", "rejected"].includes(status)) {
      await logApiCall(
        req,
        res,
        400,
        "Failed to approve/reject gate pass - invalid status",
        "gatePass",
        req.user?.id || 0
      );
      return res.status(400).json({
        message: "Status must be either 'approved' or 'rejected'",
      });
    }

    const gatePass = await GatePass.findByPk(gatePassId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    if (!gatePass) {
      await logApiCall(
        req,
        res,
        404,
        `Failed to approve/reject gate pass - not found (ID: ${gatePassId})`,
        "gatePass",
        req.user?.id || 0
      );
      return res.status(404).json({ message: "Gate pass not found" });
    }

    // Get children's user IDs
    const childrenIds = children.map((child) => child.id);

    // Check if gate pass belongs to one of the parent's children
    if (!childrenIds.includes(gatePass.userId)) {
      await logApiCall(
        req,
        res,
        403,
        `Failed to approve/reject gate pass - not child's gate pass (ID: ${gatePassId})`,
        "gatePass",
        req.user?.id || 0
      );
      return res.status(403).json({
        message: "You can only approve or reject your children's gate passes",
      });
    }

    // Check if already processed
    if (gatePass.status !== "pending") {
      await logApiCall(
        req,
        res,
        400,
        `Failed to approve/reject gate pass - already processed (ID: ${gatePassId})`,
        "gatePass",
        req.user?.id || 0
      );
      return res.status(400).json({
        message: `This gate pass has already been ${gatePass.status}`,
      });
    }

    gatePass.status = status;
    await gatePass.save();

    await logApiCall(
      req,
      res,
      200,
      `${
        status === "approved" ? "Approved" : "Rejected"
      } gate pass (ID: ${gatePassId})`,
      "gatePass",
      req.user?.id || 0
    );

    res.status(200).json({
      message: `Gate pass ${status}ed successfully`,
      gatePass,
    });
  } catch (error) {
    console.error("Error approving/rejecting gate pass:", error);
    await logApiCall(
      req,
      res,
      500,
      "Error occurred while approving/rejecting gate pass",
      "gatePass",
      req.user?.id || 0
    );
    res.status(500).json({
      message: "Error occurred while processing gate pass",
      error: error.message,
    });
  }
};
