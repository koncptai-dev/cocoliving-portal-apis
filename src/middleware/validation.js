const { check } = require('express-validator');

exports.validateSignup = [
  check('fullName').trim().isLength({ min: 2 }).withMessage("Full name must be at least 2 characters").notEmpty().withMessage('Full name is required').matches(/^[A-Za-z\s]+$/).withMessage('Full name must contain only letters and spaces'),
  check('email').isEmail().withMessage('Invalid Email').normalizeEmail(),
  check('userType').notEmpty().withMessage('User type is required'),
  check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  check('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be a valid 10-digit number'),
  check('emergencyContact').optional().matches(/^\d{10}$/).withMessage('Emergency contact must be a valid 10-digit number'),
]

exports.editUserProfileValidator = [
  check("fullName").optional().trim().isLength({ min: 2 }).withMessage("Full name must be at least 2 characters").matches(/^[A-Za-z\s]+$/).withMessage('Full name must contain only letters and spaces'),
  check("email").optional().isEmail().normalizeEmail().withMessage("Invalid email format"),
  check("phone").optional().matches(/^\+?[0-9\s\-]{7,15}$/).withMessage("Invalid phone number"),
  check("address").optional().trim().isLength({ max: 100 }).withMessage("Address must be under 100 characters"),
  check("bio").optional().trim().isLength({ max: 200 }).withMessage("Bio must be under 200 characters"),
  check("emergencyContactName").optional().trim().isLength({ min: 2 }).withMessage("Emergency contact name must be valid").matches(/^[A-Za-z\s]+$/).withMessage('Contains only letters and spaces'),
  check("emergencyContactPhone").optional().matches(/^\+?[0-9\s\-]{7,15}$/).withMessage("Invalid emergency contact phone"),
  check("livingPreferences").optional().isString().withMessage("Living preferences must be text"),
];

exports.validateLogin = [
  check("email").isEmail().withMessage("Invalid email format").normalizeEmail().notEmpty().withMessage("Email is required"),
  check("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long").notEmpty().withMessage("Password is required"),
]

exports.validateEvent = [
  check("title").matches(/^[A-Za-z\s.'-]+$/).isLength({ min: 2 }).withMessage('Contains Characters').notEmpty().withMessage("Title is required"),
  check("eventDate").isDate().withMessage("Invalid event date").notEmpty().withMessage("Event date is required").custom((value) => {
    const eventDate = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      throw new Error('Event date cannot be in the past');
    }
    return true;
  }),
  check("Location").notEmpty().withMessage("Location is required").isLength({ min: 2 }).withMessage("Location must be at least 2 characters long"),
  check("maxParticipants").isInt({ min: 1 }).withMessage("Max participants must be a positive Number").notEmpty().withMessage("Max participants is required"),
  check("description").matches(/^[A-Za-z\s.'-]+$/).withMessage('Contains Characters').notEmpty().withMessage("Description is required").isLength({ max: 500 }).withMessage("Description must be under 500 characters"),
]

exports.validateRooms = [
  check("propertyId").isInt({ min: 1 }).withMessage("Property ID must be a positive integer").notEmpty().withMessage("Property ID is required"),
  check("roomNumber").isInt({ min: 1 }).withMessage("Room number must be a positive integer").notEmpty().withMessage("Room number is required"),
  check("roomType").notEmpty().withMessage("Room type is required").isString().withMessage("Room type must be text").matches(/^[A-Za-z\s]+$/).withMessage("Room type must contain only letters and spaces"),
  check("capacity").isInt({ min: 1 }).withMessage("Capacity must be a positive integer").notEmpty().withMessage("Capacity is required"),
  check("floorNumber").isInt({ min: 0 }).withMessage("Floor number must be a valid number").notEmpty().withMessage("Floor number is required"),
  check("monthlyRent").isFloat({ min: 0 }).withMessage("Monthly rent must be a positive number").notEmpty().withMessage("Monthly rent is required"),
  check("depositAmount").isFloat({ min: 0 }).withMessage("Deposit amount must be a positive number").notEmpty().withMessage("Deposit amount is required"),
  check("preferredUserType").optional().isString().withMessage("Preferred user type must be text"),
  check("amenities").optional().isString().withMessage("Amenities must be a string (comma separated)"),
  check("description").optional().isLength({ max: 500 }).withMessage("Description must be under 500 characters"),
  check("availableForBooking").optional().isBoolean().withMessage("Available for booking must be true or false"),
];

exports.editRoomsValidate = [
  check("roomNumber").optional().isInt({ min: 1 }).withMessage("Room number must be a positive integer"),
  check("floorNumber").optional().isInt({ min: 0 }).withMessage("Floor number must be a valid non-negative integer"),
  check("roomType").optional().isString().withMessage("Room type must be text").matches(/^[A-Za-z\s]+$/).withMessage("Room type must contain only letters and spaces"),
  check("monthlyRent").optional().isFloat({ min: 1 }).withMessage("Monthly rent must be a valid amount"),
  check("depositAmount").optional().isFloat({ min: 0 }).withMessage("Deposit amount must be a valid amount"),
  check("description").optional().isLength({ max: 500 }).withMessage("Description must be under 500 characters"),
  check("availableForBooking").optional().isBoolean().withMessage("Available for booking must be true or false"),
]

exports.supportTickValidate = [
  check("roomNumber").isInt({ min: 1 }).withMessage("Room number must be a positive integer").notEmpty().withMessage("Room number is required"),
  check("date").isDate().withMessage("Invalid date").notEmpty().withMessage("Date is required"),
  check("issue").matches(/^[A-Za-z\s]+$/).withMessage("issue must contain only letters and spaces").notEmpty().withMessage("Issue is required"),
  check("description").isLength({ max: 500 }).withMessage("Description must be under 500 characters").matches(/^[A-Za-z\s]+$/).withMessage("description must contain only letters and spaces"),
]

exports.addUserValidate = [
  check('email').isEmail().withMessage('Invalid Email').normalizeEmail(),
  check('fullName').trim().isLength({ min: 2 }).withMessage("Full name must be at least 2 characters").notEmpty().withMessage('Full name is required').matches(/^[A-Za-z\s]+$/).withMessage('Full name must contain only letters and spaces'),
  check('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be a valid 10-digit number'),
  check("dateOfBirth").isDate().withMessage("Invalid date of birth").notEmpty().withMessage("Date of birth is required")
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dob > today) {
        throw new Error("Date of birth cannot be in the future");
      }
      return true;
    }),

]

exports.validateAnnouncement = [
  check("title").notEmpty().withMessage("Title is required").isLength({ min: 3, max: 100 }).withMessage("Title must be between 3 and 100 characters")
    .matches(/^[A-Za-z0-9\s.'-]+$/).withMessage("Title must contain only letters, numbers, spaces, and basic punctuation"),

  check("priority").notEmpty().withMessage("Priority is required").isString().withMessage("Priority must be a string")
    .matches(/^[A-Za-z\s]+$/).withMessage("Priority must contain only alphabets").trim(),

  check("audience").notEmpty().withMessage("Audience is required").isString().withMessage("Audience must be a string")
    .matches(/^[A-Za-z\s]+$/).withMessage("Audience must contain only alphabets").trim(),

  check("content").notEmpty().withMessage("Content is required").trim()
    .isLength({ max: 1000 }).withMessage("Content must be under 1000 characters"),

];

exports.validateProperty = [
  check("name").notEmpty().withMessage("Property name is required").matches(/^[A-Za-z\s]+$/).withMessage('Property name must contain only letters and spaces').isLength({ min: 3, max: 100 }).withMessage("Property name must be between 3 and 100 characters"),
  check("address").notEmpty().withMessage("Address is required").optional().trim().isLength({ max: 100 }).withMessage("Address must be under 100 characters"),
  check("description").optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage("Description must be under 500 characters").matches(/^[A-Za-z\s]+$/).withMessage('Description must contain only letters and spaces'),
  check("images").optional({ checkFalsy: true }).isArray().withMessage("Images must be an array"),
  check("amenities").optional({ checkFalsy: true }).isString().withMessage("Amenities must be a string").matches(/^[A-Za-z\s,]+$/).withMessage('Amenities must contain only letters and spaces'),
  check("status").optional().isString().withMessage("Status must be a string"),
]

exports.editPropertyValidate = [
  check("name").optional().matches(/^[A-Za-z\s]+$/).withMessage("Property name must contain only letters and spaces")
    .isLength({ min: 3, max: 100 }).withMessage("Property name must be between 3 and 100 characters"),

  check("address").optional().trim().isLength({ max: 100 }).withMessage("Address must be under 100 characters"),
  check("description").optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage("Description must be under 500 characters")
    .matches(/^[A-Za-z\s]+$/).withMessage("Description must contain only letters and spaces"),
  check("images").optional({ checkFalsy: true }).isArray().withMessage("Images must be an array"),
  check("amenities").optional({ checkFalsy: true }).isString().withMessage("Amenities must be a string").matches(/^[A-Za-z\s,]+$/).withMessage("Amenities must contain only letters, spaces, and commas"),
  check("status").optional().isString().withMessage("Status must be a string"),
];
