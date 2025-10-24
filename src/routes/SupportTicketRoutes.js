const express = require("express");
const router = express.Router();
const SupportTicketController=require('../controllers/SupportTicketController');
const authMiddleware = require('../middleware/auth');
const {supportTickValidate}=require('../middleware/validation');
const validate = require('../middleware/validateResult');
const upload = require('../middleware/upload');

// create Route
// router.post("/create",upload.array('ticketImage',10),supportTickValidate, validate,authMiddleware, SupportTicketController.createTicket);
router.post("/create",authMiddleware,supportTickValidate, validate, SupportTicketController.createTicket);
router.get("/get-user-tickets", authMiddleware, SupportTicketController.getUserTickets);
router.get("/get-all-tickets", authMiddleware, SupportTicketController.getAllTickets);
router.put("/update-ticket-status/:id", authMiddleware, SupportTicketController.updateTicketStatus);
router.get('/getroom', authMiddleware,SupportTicketController.getRooms);

module.exports = router;
