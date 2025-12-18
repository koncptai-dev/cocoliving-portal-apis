const { check, body } = require("express-validator");

exports.validateSignup = [
  check("fullName")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Full name must be at least 2 characters")
    .notEmpty()
    .withMessage("Full name is required")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Full name must contain only letters and spaces"),
  check("email").isEmail().withMessage("Invalid Email"),
  check("userType").notEmpty().withMessage("User type is required"),
  check("dateOfBirth")
    .notEmpty()
    .withMessage("Date of Birth is required")
    .isDate({ format: "YYYY-MM-DD" })
    .withMessage("Invalid Date of Birth")
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        throw new Error("You must be at least 18 years old");
      }
      return true;
    }),

  check("phone")
    .optional({ checkFalsy: true })
    .matches(/^\d{10}$/)
    .withMessage("Phone must be a valid 10-digit number"),
  check("emergencyContact")
    .optional()
    .matches(/^\d{10}$/)
    .withMessage("Emergency contact must be a valid 10-digit number"),
];

exports.editUserProfileValidator = [
  check("fullName")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Full name must be at least 2 characters")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Full name must contain only letters and spaces"),
  check("email").optional().isEmail().withMessage("Invalid email format"),
  check("phone")
    .optional()
    .matches(/^\+?[0-9\s\-]{7,15}$/)
    .withMessage("Invalid phone number"),
  check("address")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Address must be under 100 characters"),
];

exports.validateLogin = [
  check("email")
    .isEmail()
    .withMessage("Invalid email format")
    .notEmpty()
    .withMessage("Email is required"),
  // check("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long").notEmpty().withMessage("Password is required"),
];

exports.validateEvent = [
  check("title")
    .matches(/^[A-Za-z\s.'-]+$/)
    .withMessage("Title Contains Characters")
    .isLength({ min: 2 })
    .notEmpty()
    .withMessage("Title is required"),
  check("eventDate")
    .isDate()
    .withMessage("Invalid event date")
    .notEmpty()
    .withMessage("Event date is required")
    .custom((value) => {
      const eventDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (eventDate < today) {
        throw new Error("Event date cannot be in the past");
      }
      return true;
    }),
  check("location")
    .notEmpty()
    .withMessage("Location is required")
    .isLength({ min: 2 })
    .withMessage("Location must be at least 2 characters long"),
  check("maxParticipants")
    .isInt({ min: 1 })
    .withMessage("Max participants must be a positive Number")
    .notEmpty()
    .withMessage("Max participants is required"),
  check("description")
    .optional({ checkFalsy: true })
    .matches(/^[A-Za-z\s.'-]+$/)
    .withMessage("Contains Characters")
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters"),
];

exports.validateRooms = [
  check("propertyId")
    .isInt({ min: 1 })
    .withMessage("Property ID must be a positive integer")
    .notEmpty()
    .withMessage("Property ID is required"),
  check("roomNumber")
    .isInt({ min: 1 })
    .withMessage("Room number must be a positive integer")
    .notEmpty()
    .withMessage("Room number is required"),
  check("roomType")
    .notEmpty()
    .withMessage("Room type is required")
    .isString()
    .withMessage("Room type must be text")
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage("Room type must contain only letters, numbers, and spaces"),
  check("capacity")
    .isInt({ min: 1 })
    .withMessage("Capacity must be a positive integer")
    .notEmpty()
    .withMessage("Capacity is required"),
  check("floorNumber")
    .isInt({ min: 0 })
    .withMessage("Floor number must be a valid number")
    .notEmpty()
    .withMessage("Floor number is required"),
  // check("images").optional({ checkFalsy: true }).isArray().withMessage("Images must be an array")
  //   .custom((images) => {
  //     if (images.length > 20) {
  //       throw new Error("You can upload a maximum of 20 images only");
  //     }
  //     return true;
  //   }),
  check("monthlyRent")
    .isFloat({ min: 0 })
    .withMessage("Monthly rent must be a positive number")
    .notEmpty()
    .withMessage("Monthly rent is required"),
  check("depositAmount")
    .isFloat({ min: 0 })
    .withMessage("Deposit amount must be a positive number")
    .notEmpty()
    .withMessage("Deposit amount is required"),
  check("preferredUserType")
    .optional()
    .isString()
    .withMessage("Preferred user type must be text"),
  check("amenities")
    .optional()
    .isString()
    .withMessage("Amenities must be a string (comma separated)"),
  check("description")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters"),
  check("availableForBooking")
    .optional()
    .isBoolean()
    .withMessage("Available for booking must be true or false"),
];

exports.editRoomsValidate = [
  check("roomNumber")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Room number must be a positive integer"),
  check("floorNumber")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Floor number must be a valid non-negative integer"),
  check("roomType")
    .optional()
    .isString()
    .withMessage("Room type must be text")
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage("Room type must contain only letters, numbers, and spaces"),
  // check("images").optional({ checkFalsy: true }).isArray().withMessage("Images must be an array")
  //   .custom((images) => {
  //     if (images.length > 20) {
  //       throw new Error("You can upload a maximum of 20 images only");
  //     }
  //     return true;
  //   }),
  check("monthlyRent")
    .optional()
    .isFloat({ min: 1 })
    .withMessage("Monthly rent must be a valid amount"),
  check("depositAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Deposit amount must be a valid amount"),
  check("description")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters"),
  check("availableForBooking")
    .optional()
    .isBoolean()
    .withMessage("Available for booking must be true or false"),
];

exports.supportTickValidate = [
  check("roomNumber")
    .isInt({ min: 1 })
    .withMessage("Room number must be a positive integer")
    .notEmpty()
    .withMessage("Room number is required"),
  check("date")
    .isDate()
    .withMessage("Invalid date")
    .notEmpty()
    .withMessage("Date is required"),
  check("issue")
    .matches(/^[A-Za-z0-9\s,.-]+$/)
    .withMessage("Issue must contain only letters, numbers, spaces, and , . -")
    .notEmpty()
    .withMessage("Issue is required"),
  check("description")
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters")
    .matches(/^[A-Za-z0-9\s,.-]*$/)
    .withMessage("Description can contain letters, numbers, spaces, and , . -"),
];

exports.addUserValidate = [
  check("email").isEmail().withMessage("Invalid Email"),
  check("fullName")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Full name must be at least 2 characters")
    .notEmpty()
    .withMessage("Full name is required")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Full name must contain only letters and spaces"),
  check("phone")
    .optional()
    .matches(/^\d{10}$/)
    .withMessage("Phone must be a valid 10-digit number"),
];

exports.validateAnnouncement = [
  check("title")
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be between 3 and 100 characters")
    .matches(/^[A-Za-z0-9\s.'-]+$/)
    .withMessage(
      "Title must contain only letters, numbers, spaces, and basic punctuation"
    ),

  body("priority")
    .notEmpty()
    .withMessage("Priority is required")
    .isString()
    .withMessage("Priority must be a string")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Priority must contain only alphabets")
    .trim(),

  check("audience")
    .notEmpty()
    .withMessage("Audience is required")
    .isString()
    .withMessage("Audience must be a string")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Audience must contain only alphabets")
    .trim(),

  check("content")
    .notEmpty()
    .withMessage("Content is required")
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Content must be under 1000 characters"),
];

exports.validateProperty = [
  check("name")
    .notEmpty()
    .withMessage("Property name is required")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Property name must contain only letters and spaces")
    .isLength({ min: 3, max: 100 })
    .withMessage("Property name must be between 3 and 100 characters"),
  check("address")
    .notEmpty()
    .withMessage("Address is required")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Address must be under 100 characters"),
  check("description")
    .optional({ checkFalsy: true })
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters"),
  check("images")
    .optional({ checkFalsy: true })
    .isArray()
    .withMessage("Images must be an array")
    .custom((images) => {
      if (images.length > 20) {
        throw new Error("You can upload a maximum of 20 images only");
      }
      return true;
    }),
  ,
  check("amenities")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Amenities must be a string")
    .matches(/^[A-Za-z\s,]+$/)
    .withMessage("Amenities must contain only letters and spaces"),
  check("status").optional().isString().withMessage("Status must be a string"),
];

exports.editPropertyValidate = [
  check("name")
    .optional()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("Property name must contain only letters and spaces")
    .isLength({ min: 3, max: 100 })
    .withMessage("Property name must be between 3 and 100 characters"),

  check("address")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Address must be under 100 characters"),
  check("description")
    .optional({ checkFalsy: true })
    .matches(/^[A-Za-z0-9\s.,'()-]+$/)
    .withMessage("Description contains invalid characters")
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters"),
  check("images")
    .optional({ checkFalsy: true })
    .isArray()
    .withMessage("Images must be an array")
    .custom((images) => {
      if (images.length > 20) {
        throw new Error("You can upload a maximum of 20 images only");
      }
      return true;
    }),
  check("amenities")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Amenities must be a string")
    .matches(/^[A-Za-z\s,]+$/)
    .withMessage("Amenities must contain only letters, spaces, and commas"),
  check("status").optional().isString().withMessage("Status must be a string"),
];

exports.validateGatePass = [
  check("requestType")
    .notEmpty()
    .withMessage("Request type is required")
    .isString()
    .withMessage("Request type must be a string")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Request type must be between 1 and 100 characters"),
  check("date")
    .isDate()
    .withMessage("Invalid date format")
    .notEmpty()
    .withMessage("Date is required")
    .custom((value) => {
      const requestDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      requestDate.setHours(0, 0, 0, 0);
      if (requestDate < today) {
        throw new Error("Date cannot be in the past");
      }
      return true;
    }),
  check("time")
    .notEmpty()
    .withMessage("Time is required")
    .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Time must be in HH:MM format (24-hour)"),
  check("reason")
    .notEmpty()
    .withMessage("Reason is required")
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Reason must be between 5 and 500 characters")
    .matches(/^[A-Za-z0-9\s.,'()-]+$/)
    .withMessage("Reason contains invalid characters"),
];

exports.validateGatePassUpdate = [
  check("requestType")
    .optional()
    .isString()
    .withMessage("Request type must be a string")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Request type must be between 1 and 100 characters"),
  check("date")
    .optional()
    .isDate()
    .withMessage("Invalid date format")
    .custom((value) => {
      const requestDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      requestDate.setHours(0, 0, 0, 0);
      if (requestDate < today) {
        throw new Error("Date cannot be in the past");
      }
      return true;
    }),
  check("time")
    .optional()
    .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Time must be in HH:MM format (24-hour)"),
  check("reason")
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Reason must be between 5 and 500 characters")
    .matches(/^[A-Za-z0-9\s.,'()-]+$/)
    .withMessage("Reason contains invalid characters"),
];

exports.validateGatePassStatus = [
  check("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be either 'approved' or 'rejected'"),
];
