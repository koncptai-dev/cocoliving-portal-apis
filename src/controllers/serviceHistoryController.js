const ServiceHistory = require("../models/serviceHistory");
const Inventory = require("../models/inventory");
const { Op } = require("sequelize");
const SupportTicket = require("../models/supportTicket");
const User = require("../models/user");
// Create a service record for one inventory item
exports.createServiceRecord = async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const {
      ticketId,
      issueDescription,
      assignedTo,
      serviceDate,
      resolutionNotes,
      status,
    } = req.body;

    if (!issueDescription)
      return res.status(400).json({ message: "issueDescription is required" });

    const item = await Inventory.findByPk(inventoryId);
    if (!item)
      return res.status(404).json({ message: "Inventory item not found" });

    const record = await ServiceHistory.create({
      inventoryId,
      ticketId: ticketId || null,
      issueDescription,
      assignedTo: assignedTo || null,
      serviceDate: serviceDate || new Date(),
      resolutionNotes: resolutionNotes || null,
      status: status || "Open",
    });

    return res.status(201).json({ message: "Service record created", record });
  } catch (err) {
    console.error("ServiceHistory create error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

// List records for a particular inventory item
exports.getServiceHistoryForItem = async (req, res) => {
  try {
    const { inventoryId } = req.params;

    const item = await Inventory.findByPk(inventoryId);
    if (!item)
      return res.status(404).json({ message: "Inventory item not found" });

    const records = await ServiceHistory.findAll({
      where: { inventoryId },
      order: [["serviceDate", "DESC"]],
      include: [
        {
          model: SupportTicket,
          as: "ticket",
          attributes: ["id", "issue", "priority", "status", "assignedTo"],
        },
        {
          model: User,
          as: "assignedAdmin",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    return res.status(200).json({ serviceHistory: records });
  } catch (err) {
    console.error("ServiceHistory list error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

// Get all service records (for all inventory items)
exports.getAllServiceRecords = async (req, res) => {
  try {
    const records = await ServiceHistory.findAll({
      include: [
        {
          model: Inventory,
          attributes: ["id", "itemName", "inventoryCode"],
        },
         {
          model: SupportTicket,
          as: "ticket",
          attributes: ["id", "issue", "priority", "status", "assignedTo"],
        },
        {
          model: User,
          as: "assignedAdmin",
          attributes: ["id", "fullName", "email"],
        },
      ],
      order: [["serviceDate", "DESC"]],
    });

    return res.status(200).json({ serviceHistory: records });
  } catch (err) {
    console.error("ServiceHistory getAll error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

// Update a service record (resolve, add notes, change status)
exports.updateServiceRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const record = await ServiceHistory.findByPk(id);
    if (!record)
      return res.status(404).json({ message: "Service record not found" });

    await record.update(updates);
    return res.status(200).json({ message: "Service record updated", record });
  } catch (err) {
    console.error("ServiceHistory update error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

// Delete a service record safely (requires inventoryId + recordId)
exports.deleteServiceRecord = async (req, res) => {
  try {
    const { inventoryId, id } = req.params;

    const record = await ServiceHistory.findOne({
      where: { id, inventoryId },
    });

    if (!record)
      return res
        .status(404)
        .json({ message: "Service record not found for this inventory" });

    await record.destroy();

    return res
      .status(200)
      .json({ message: "Service record deleted successfully" });
  } catch (err) {
    console.error("ServiceHistory delete error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};
// Create or update Service History record for a support ticket
exports.createFromTicket = async (ticket) => {
  try {
    const ServiceHistory = require("../models/serviceHistory");
    const Inventory = require("../models/inventory");

    let record = await ServiceHistory.findOne({
      where: { ticketId: ticket.id },
    });

    const newStatus =
      ticket.status?.toLowerCase() === "resolved"
        ? "Resolved"
        : ticket.status?.toLowerCase() === "in-progress"
        ? "In Progress"
        : "Open";

    if (record) {
      await record.update({
        assignedTo: ticket.assignedTo || record.assignedTo,
        resolutionNotes: ticket.description || record.resolutionNotes,
        status: newStatus,
        serviceDate: new Date(),
      });
    }

    else {
      record = await ServiceHistory.create({
        inventoryId: ticket.inventoryId || null,
        ticketId: ticket.id,
        supportCode: ticket.supportCode || null,
        inventoryName: ticket.inventoryName || null,
        issueDescription: ticket.issue || "No issue description provided",
        assignedTo: ticket.assignedTo || null,
        serviceDate: new Date(),
        resolutionNotes: ticket.description || null,
        status: newStatus,
      });
    }

    if (ticket.inventoryId) {
      const inventory = await Inventory.findByPk(ticket.inventoryId);
      if (inventory) {
        if (newStatus === "In Progress") {
          await inventory.update({
            status: "Under Repair",
            condition: "Under Maintenance",
          });
        } else if (newStatus === "Resolved") {
          await inventory.update({
            status: "Available",
            condition: "Good",
          });
        }
      }
    }

    return record;
  } catch (error) {
    console.error("Error linking service history to ticket:", error);
  }
};