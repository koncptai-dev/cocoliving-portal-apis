const Booking = require('../models/bookRoom');
const BookingOnboarding = require('../models/bookingOnboarding');
const User = require('../models/user');
const OTP = require('../models/otp');
const otpGenerator = require('otp-generator');
const { smsSender } = require('../utils/smsService');
const { otpEmail } = require('../utils/emailTemplates/emailTemplates');
const { mailsender } = require('../utils/emailService');
const assertAdmin = (role) => role === 1 || role === 3;

exports.startOnboarding = async (req, res) => {
  const checklist = [
    { key: 'bed', label: 'Bed', checked: false },
    { key: 'mattress', label: 'Mattress', checked: false },
    { key: 'table', label: 'Table', checked: false },
    { key: 'chair', label: 'Chair', checked: false },
    { key: 'almirah', label: 'Almirah', checked: false },
  ];
  const { bookingId } = req.params;

  if (!assertAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const booking = await Booking.findByPk(bookingId);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (
    booking.status !== 'approved' ||
    booking.paymentStatus !== 'COMPLETED'
  ) {
    return res.status(422).json({
      message: 'Booking not eligible for onboarding'
    });
  }

  let onboarding = await BookingOnboarding.findOne({ where: { bookingId } });

  if (!onboarding) {
    onboarding = await BookingOnboarding.create({
      bookingId,
      checklist: checklist,
      startedBy: req.user.id,
    });

    booking.onboardingStatus = 'INITIATED';
    await booking.save();
  }

  return res.json({ onboarding });
};

exports.updateChecklist = async (req, res) => {
  const { bookingId } = req.params;
  const { checklist } = req.body;
  if (!assertAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const onboarding = await BookingOnboarding.findOne({ where: { bookingId } });
  if (!onboarding) {
    return res.status(404).json({ message: 'Onboarding not found' });
  }

  onboarding.checklist = checklist;
  await onboarding.save();

  return res.json({ success: true });
};

exports.completeOnboarding = async (req, res) => {
  const { bookingId } = req.params;
  if (!assertAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: User, as: 'user' }]
  });

  if (!booking) {
    return res.status(404).json({ message: 'Booking not found' });
  }
  if (booking.onboardingStatus === 'COMPLETED') {
    return res.status(409).json({ message: 'Onboarding already completed' });
  }
  const onboarding = await BookingOnboarding.findOne({ where: { bookingId } });
  if (!onboarding) {
    return res.status(404).json({ message: 'Onboarding not found' });
  }

  const allChecked = onboarding.checklist.every(i => i.checked);
  if (!allChecked) {
    return res.status(422).json({ message: 'Checklist incomplete' });
  }
  const { channel = 'phone' } = req.body;
  let identifier;

  if (channel === 'email') {
    if (!booking.user.email) {
      return res.status(422).json({ message: 'User email missing' });
    }
    identifier = booking.user.email;
  } else {
    if (!booking.user.phone) {
      return res.status(422).json({ message: 'User phone missing' });
    }
    identifier = booking.user.phone;
  }
  await OTP.destroy({ where: { identifier: identifier, type: channel } });

  const otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });

  await OTP.create({
    identifier: identifier,
    type: channel,
    otp,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  if (channel === 'email') {
    const mail = otpEmail({ otp });
    await mailsender(
        booking.user.email,
        'Coco Living - Onboarding OTP',
        mail.html,
        mail.attachments
    );
  } else {
    await smsSender(identifier, 'otp', { otp });
  }
  onboarding.otpSentAt = new Date();
  onboarding.otpChannel = channel;
  await onboarding.save();

  booking.onboardingStatus = 'OTP_PENDING';
  await booking.save();

  return res.json({ success: true });
};

exports.verifyOnboardingOtp = async (req, res) => {
  const { bookingId } = req.params;
  const { otp } = req.body;

  if (!assertAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: User, as: 'user' }]
  });

  if (!booking || !booking.user) {
    return res.status(404).json({ message: 'Booking or user not found' });
  }

  if (booking.onboardingStatus === 'COMPLETED') {
    return res.status(409).json({ message: 'Onboarding already completed' });
  }

  const onboarding = await BookingOnboarding.findOne({ where: { bookingId } });
  if (!onboarding) {
    return res.status(404).json({ message: 'Onboarding not found' });
  }

  const channel = onboarding.otpChannel;
  if (!channel) {
    return res.status(400).json({ message: 'OTP channel not found' });
  }

  const identifier =
    channel === 'email'
      ? booking.user.email
      : booking.user.phone;

  const record = await OTP.findOne({
    where: { identifier, type: channel },
    order: [['createdAt', 'DESC']]
  });

  if (!record || record.expiresAt < new Date() || record.otp !== otp) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  await OTP.destroy({ where: { identifier, type: channel } });

  onboarding.completedAt = new Date();
  await onboarding.save();

  booking.onboardingStatus = 'COMPLETED';
  await booking.save();

  return res.json({ success: true });
};

exports.getOnboardingByBookingId = async (req, res) => {
  const { bookingId } = req.params;

  if (!assertAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const booking = await Booking.findByPk(bookingId, {
    include: [
      { model: User, as: 'user', attributes: ['id', 'fullName', 'email', 'phone']},
      { model: BookingOnboarding, as: 'onboarding' }
    ]
  });

  if (!booking) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  return res.status(200).json({
    bookingId: booking.id,
    onboardingStatus: booking.onboardingStatus,
    user: booking.user,
    onboarding: booking.onboarding || null
  });
};