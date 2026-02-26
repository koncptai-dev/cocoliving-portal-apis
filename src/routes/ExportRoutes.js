const express = require("express");
const router = express.Router();
const ExportUsers = require("../controllers/ExportUsers");

router.get("/users/:propertyId", ExportUsers.exportPropertyUsersZip);

module.exports = router;