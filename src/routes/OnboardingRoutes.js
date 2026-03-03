const router = require('express').Router();
const onboardingController = require('../controllers/OnboardingController');
const auth = require('../middleware/auth');
const authorizeRole = require("../middleware/authorizeRole");
const upload = require('../middleware/upload');

// admin
router.get('/:bookingId', auth,authorizeRole(1,3), onboardingController.getOnboardingByBookingId);
router.post('/:bookingId/start', auth, authorizeRole(1,3), onboardingController.startOnboarding);
router.put('/:bookingId/checklist', auth, authorizeRole(1,3), onboardingController.updateChecklist);
router.post('/:bookingId/complete', auth, authorizeRole(1,3), onboardingController.completeOnboarding);
router.post('/:bookingId/verify-otp', auth, authorizeRole(1,3), onboardingController.verifyOnboardingOtp);
router.post('/:bookingId/proof',auth,authorizeRole(1,3),upload.single('proofOfWork'),onboardingController.uploadProofOfWork);

module.exports = router;