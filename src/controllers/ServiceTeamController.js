const User = require('../models/user');
const { Op } = require('sequelize');
require('dotenv').config();
const { mailsender } = require('../utils/emailService');
const { logApiCall } = require("../helpers/auditLog");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ServiceTeam = require('../models/serviceTeam');
const ServiceTeamProperty = require('../models/serviceTeamProperty');
const ServiceTeamRoom = require('../models/serviceTeamRoom');
const Property = require('../models/property');
const Room = require('../models/rooms');
const sequelize = require('../config/database');

//create service team member
exports.registerServiceTeam = async (req, res) => {
    const t = await sequelize.transaction();
    try {

        const { fullName, email, phone, password, serviceRoleType, properties, floorsRooms } = req.body;

        const existingUser = await User.findOne({ where: { email } });

        if (existingUser) {
            return res.status(400).json({ message: 'Service Team Member already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create(
            {
                fullName,
                phone,
                email,
                password: hashedPassword,
                role: 4,
                status: 1,
                userType: "service-member",
            }, { transaction: t });

        //create service team details
        const serviceTeam = await ServiceTeam.create({
            userId: user.id,
            serviceRoleType,
        }, { transaction: t });

        //assign property
        let propertyIdsToAssign = properties;

        // If all properties selected → assign all
        const totalProperties = await Property.count();
        if (properties.length === totalProperties) {
            const allProps = await Property.findAll();
            propertyIdsToAssign = allProps.map(p => p.id);
        }
        // Insert ServiceTeamProperty
        if (propertyIdsToAssign && propertyIdsToAssign.length > 0) {
            const propData = propertyIdsToAssign.map(pid => ({
                serviceTeamId: serviceTeam.id,
                propertyId: pid
            }));
            await ServiceTeamProperty.bulkCreate(propData, { transaction: t });
        }

        // Handle Floors & Rooms per property
        for (let pid of propertyIdsToAssign) {
            const fr = floorsRooms?.find(f => f.propertyId === pid);

            if (fr) {
                const roomData = [];

                // Floors selected
                if (fr.floorNumbers && fr.floorNumbers.length > 0) {
                    for (let floor of fr.floorNumbers) {
                        if (fr.roomIds && fr.roomIds.length > 0) {
                            for (let roomId of fr.roomIds) {
                                roomData.push({
                                    serviceTeamId: serviceTeam.id,
                                    propertyId: pid,
                                    floorNumber: floor,
                                    roomId
                                });
                            }
                        } else {
                            // all rooms in this floor
                            roomData.push({
                                serviceTeamId: serviceTeam.id,
                                propertyId: pid,
                                floorNumber: floor,
                                roomId: null
                            });
                        }
                    }
                } else if (fr.roomIds && fr.roomIds.length > 0) {
                    // only rooms selected → floors auto-detected
                    for (let roomId of fr.roomIds) {
                        const room = await Room.findByPk(roomId);
                        roomData.push({
                            serviceTeamId: serviceTeam.id,
                            propertyId: pid,
                            floorNumber: room.floorNumber,
                            roomId
                        });
                    }
                }

                if (roomData.length > 0) {
                    await ServiceTeamRoom.bulkCreate(roomData, { transaction: t });
                }

            } else {
                // No floors/rooms selected → assign all floors & rooms
                const rooms = await Room.findAll({ where: { propertyId: pid } });
                const allRoomData = rooms.length > 0
                    ? rooms.map(r => ({
                        serviceTeamId: serviceTeam.id,
                        propertyId: pid,
                        floorNumber: r.floorNumber,
                        roomId: r.id
                    }))
                    : [{
                        serviceTeamId: serviceTeam.id,
                        propertyId: pid,
                        floorNumber: null,
                        roomId: null
                    }];

                await ServiceTeamRoom.bulkCreate(allRoomData, { transaction: t });
            }
        }

        await t.commit();
        return res.status(201).json({ success: true, message: 'Service Team Member Created', userId: user.id });
    }
    catch (error) {
        await t.rollback();
        await logApiCall(req, res, 500, "Error occurred while registering Service Team Member", "admin");
        res.status(500).json({ message: "Server error", error: error.message });
    }

}

//edit service team member
exports.editServiceTeam = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const serviceTeamId = req.params.id;
        const { fullName, phone, email, serviceRoleType } = req.body;

        const serviceTeam = await ServiceTeam.findByPk(serviceTeamId, {
            include: [{ model: User, as: "user" }]
        });
        if (!serviceTeam) {
            return res.status(404).json({ message: "Service team not found" });
        }
        const existingUser = await User.findOne({
            where: {
                email,
                id: { [Op.ne]: serviceTeam.userId }
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: "Email already in use by another user"
            });
        }
        const updateUser = {};
        if (fullName) updateUser.fullName = fullName;
        if (email) updateUser.email = email;
        if (phone) updateUser.phone = phone;

        if (Object.keys(updateUser).length > 0) {
            await User.update(updateUser, {
                where: { id: serviceTeam.userId },
                transaction: t
            });
        }
        if (serviceRoleType) {
            await ServiceTeam.update(
                { serviceRoleType },
                { where: { id: serviceTeamId }, transaction: t }
            );
        }

        await t.commit();
        return res.json({ success: true, message: "Service team updated successfully" });
    } catch (error) {
        await t.rollback();
        console.error("Update Service Team Error:", error);
        res.status(500).json({ message: "Failed to update service team" });
    }
};

//get all service team members for ADMIN
exports.getAllServiceTeamMembers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const { rows: serviceTeams, count } = await ServiceTeam.findAndCountAll({
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ['id', 'fullName', 'email', 'phone', 'status']
                },
                {
                    model: ServiceTeamProperty,
                    as: "assignedProperties",
                    include: [
                        {
                            model: Property,
                            as: "teamproperty",
                            attributes: ['id', 'name']
                        }
                    ]
                },
                {
                    model: ServiceTeamRoom,
                    as: "assignedRooms",
                    where: { isActive: true },
                    required: false,
                    include: [
                        {
                            model: Room,
                            as: "teamroom",
                            attributes: ['id', 'roomNumber', 'floorNumber']
                        }
                    ]
                }
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });

        // Format response cleanly for frontend
        const formatted = serviceTeams.map(st => {
            const properties = st.assignedProperties.map(sp => ({
                id: sp.teamproperty.id,
                name: sp.teamproperty.name
            }));

            const rooms = st.assignedRooms.map(sr => ({
                propertyId: sr.propertyId,
                roomId: sr.roomId,
                floorNumber: sr.teamroom ? sr.teamroom.floorNumber : null,
                roomNumber: sr.teamroom ? sr.teamroom.roomNumber : null
            }));

            return {
                id: st.id,
                userId: st.userId,
                fullName: st.user.fullName,
                email: st.user.email,
                phone: st.user.phone,
                serviceRoleType: st.serviceRoleType,
                status: st.user.status,
                properties,
                rooms
            };
        });

        const totalPages = Math.ceil(count / limit);

        res.status(200).json({
            serviceTeams: formatted,
            currentPage: page,
            totalPages,
            totalRecords: count
        });
    } catch (err) {
        console.log("Error in getAllServiceTeamMembers:", err);
        res.status(500).json({ message: "Failed to fetch service team members" });
    }
};

//get assigned rooms for service team member
exports.getAssignedRoomsForServiceTeam = async (req, res) => {
    try {
        const userId = req.user.id;

        // find service team
        const serviceTeam = await ServiceTeam.findOne({
            where: { userId }
        });

        if (!serviceTeam) {
            return res.status(404).json({ message: "Service team not found" });
        }


        const assigned = await ServiceTeamRoom.findAll({
            where: {
                serviceTeamId: serviceTeam.id,
                isActive: true
            },
            include: [
                {
                    model: Room,
                    as: "teamroom",
                    attributes: ["id", "roomNumber", "floorNumber", "propertyId"]
                }
            ]
        });

        // remove duplicates
        const roomMap = new Map();


        assigned.forEach(r => {
            if (r.roomId && r.teamroom) {
                roomMap.set(r.roomId, {
                    id: r.teamroom.id,
                    roomNumber: r.teamroom.roomNumber,
                    floorNumber: r.teamroom.floorNumber,
                    propertyId: r.teamroom.propertyId
                });
            }
        });

        res.json({
            rooms: Array.from(roomMap.values())
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load assigned rooms" });
    }
};

// Reassign service member to properties and rooms
exports.reassignServiceTeamRooms = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { serviceTeamId, assignments, isEdit } = req.body;

        if (
            !serviceTeamId ||
            !Array.isArray(assignments) ||
            assignments.length === 0
        ) {
            return res.status(400).json({ message: "Invalid input" });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        if (isEdit) {
            await ServiceTeamRoom.update(
                {
                    isActive: false,
                    effectiveToDate: new Date()
                },
                {
                    where: {
                        serviceTeamId,
                        isActive: true
                    },
                    transaction: t
                }
            );
        }

        for (const a of assignments) {
            const { propertyId, roomIds } = a;

            if (!propertyId || !Array.isArray(roomIds)) {
                await t.rollback();
                return res.status(400).json({ message: "Invalid assignment data" });
            }

            
            const effectiveFromDate = isEdit ? new Date() : tomorrow;

            //  old active rooms
            await ServiceTeamRoom.update(
                {
                    isActive: false,
                    effectiveToDate: new Date()
                },
                {
                    where: {
                        serviceTeamId,
                        propertyId,
                        isActive: true
                    },
                    transaction: t
                }
            );

            // insert new rooms
            const uniqueRoomIds = [...new Set(roomIds)];
            const newRooms = [];

            if (uniqueRoomIds.length === 0) {
                // means ALL rooms
                newRooms.push({
                    serviceTeamId,
                    propertyId,
                    roomId: null,
                    floorNumber: null,
                    effectiveFromDate,
                    isActive: true
                });
            } else {
                for (const roomId of uniqueRoomIds) {
                    const room = await Room.findByPk(roomId);
                    if (!room) {
                        await t.rollback();
                        return res.status(400).json({ message: `Room ${roomId} not found` });
                    }

                    newRooms.push({
                        serviceTeamId,
                        propertyId,
                        roomId,
                        floorNumber: room.floorNumber,
                        effectiveFromDate,
                        isActive: true
                    });
                }
            }

            await ServiceTeamRoom.bulkCreate(newRooms, { transaction: t });
        }

        await t.commit();
        res.json({
            success: true,
            message: "Rooms reassigned successfully"
        });
    } catch (err) {
        await t.rollback();
        console.error("Room reassignment error:", err);
        res.status(500).json({
            message: "Room reassignment failed",
            error: err.message
        });
    }
};

