const express = require("express");
const router = express.Router();
const SupportTicketController=require('../controllers/SupportTicketController');
const authMiddleware = require('../middleware/auth');
const {supportTickValidate}=require('../middleware/validation');
const validate = require('../middleware/validateResult');
const upload = require('../middleware/upload');

// create Route
router.post("/create",upload.fields([{ name: 'ticketImage', maxCount: 10 },{ name: 'ticketVideo', maxCount: 3 }]),supportTickValidate, validate,authMiddleware, SupportTicketController.createTicket);
router.get("/get-user-tickets", authMiddleware, SupportTicketController.getUserTickets);
router.get("/get-all-tickets", authMiddleware, SupportTicketController.getAllTickets);
router.put("/update-ticket-status/:id", authMiddleware, SupportTicketController.updateTicketStatus);
router.get('/getroom', authMiddleware,SupportTicketController.getRooms);

router.get("/ticket-details/:id", authMiddleware, SupportTicketController.getTicketDetails);

module.exports = router;
