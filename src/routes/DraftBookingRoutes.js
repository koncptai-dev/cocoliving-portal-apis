const express = require("express");
const DraftBooking = require("../controllers/DraftBooking");
const authMiddleware = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");
const authorizePage = require("../middleware/authorizePage");

const router = express.Router();

router.get( "/:bookingId/details", authMiddleware, authorizeRole(1, 3), authorizePage("Bookings", "read"), DraftBooking.getDraftBookingDetails );
router.get( "/payment-form", authMiddleware, authorizeRole(1, 3), authorizePage("Bookings", "read"), DraftBooking.getBookingPaymentFormData );
router.post( "/payment-form/review", authMiddleware, authorizeRole(1, 3), authorizePage("Bookings", "write"), DraftBooking.reviewBookingPayment );
router.post( "/", authMiddleware, authorizeRole(1, 3), authorizePage("Bookings", "write"), DraftBooking.draftBooking );

module.exports = router;
