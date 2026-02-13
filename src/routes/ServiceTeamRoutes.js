const express = require("express");
const router = express.Router();
const ServiceTeamController=require('../controllers/ServiceTeamController');
const authMiddleware = require('../middleware/auth');

// create Route admin
router.post("/register",authMiddleware, ServiceTeamController.registerServiceTeam);
router.put("/edit/:id",authMiddleware, ServiceTeamController.editServiceTeam);
router.get("/getAll",authMiddleware, ServiceTeamController.getAllServiceTeamMembers);
router.get("/assigned-rooms", authMiddleware, ServiceTeamController.getAssignedRoomsForServiceTeam);
router.put("/reassign-rooms", authMiddleware, ServiceTeamController.reassignServiceTeamRooms);

module.exports = router;
