const express = require("express");
const router = express.Router();
const SupportTicketController=require('../controllers/SupportTicketController');
const authMiddleware = require('../middleware/auth');
const {supportTickValidate}=require('../middleware/validation');
const validate = require('../middleware/validateResult');
const upload = require('../middleware/upload');
const authorizeRole = require("../middleware/authorizeRole");

// create Route user
router.post("/create",upload.fields([{ name: 'ticketImage', maxCount: 10 },{ name: 'ticketVideo', maxCount: 3 }]),supportTickValidate, validate,authMiddleware, SupportTicketController.createTicket);
router.get("/get-user-tickets", authMiddleware, SupportTicketController.getUserTickets);

// admin
router.get("/get-all-tickets", authMiddleware,authorizeRole(1,3), SupportTicketController.getAllTickets);
router.put("/update-ticket-status/:id", authMiddleware,authorizeRole(1,3), SupportTicketController.updateTicketStatus);
router.get('/getroom', authMiddleware,authorizeRole(1,3),SupportTicketController.getRooms);

//admin nd user
router.get("/ticket-details/:id", authMiddleware, authorizeRole(1,2,3), SupportTicketController.getTicketDetails);

module.exports = router;
