const sanitizeHtml = require("sanitize-html");

const sanitize = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === "string") {
      return sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
      });
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (typeof value === "object" && value !== null) {
      const sanitizedObj = {};
      for (const key in value) {
        sanitizedObj[key] = sanitizeValue(value[key]);
      }
      return sanitizedObj;
    }

    return value;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  next();
};

module.exports = sanitize;