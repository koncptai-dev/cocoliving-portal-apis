const router = require('express').Router();
const onboardingController = require('../controllers/OnboardingController');
const auth = require('../middleware/auth');

router.get('/:bookingId', auth, onboardingController.getOnboardingByBookingId);
router.post('/:bookingId/start', auth, onboardingController.startOnboarding);
router.put('/:bookingId/checklist', auth, onboardingController.updateChecklist);
router.post('/:bookingId/complete', auth, onboardingController.completeOnboarding);
router.post('/:bookingId/verify-otp', auth, onboardingController.verifyOnboardingOtp);

module.exports = router;