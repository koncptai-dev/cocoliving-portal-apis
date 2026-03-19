const express = require("express");
const router = express.Router();
const ServiceTeamController=require('../controllers/ServiceTeamController');
const authMiddleware = require('../middleware/auth');
const authorizePage = require("../middleware/authorizePage");
const authorizeRole = require("../middleware/authorizeRole");


// create Route admin
router.post("/register",authMiddleware, authorizeRole(1,3), authorizePage("Service Team Management", "write"), ServiceTeamController.registerServiceTeam);
router.put("/edit/:id",authMiddleware, authorizeRole(1,3), authorizePage("Service Team Management", "write"), ServiceTeamController.editServiceTeam);
router.get("/getAll",authMiddleware,  authorizePage("Service Team Management", "read"), ServiceTeamController.getAllServiceTeamMembers);
router.get("/assigned-rooms", authMiddleware, authorizeRole(1,3), authorizePage("Service Team Management", "read"), ServiceTeamController.getAssignedRoomsForServiceTeam);
router.put("/reassign-rooms", authMiddleware, authorizeRole(1,3), authorizePage("Service Team Management", "write"), ServiceTeamController.reassignServiceTeamRooms);

module.exports = router;
