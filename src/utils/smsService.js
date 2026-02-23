const axios = require("axios");
require("dotenv").config();
// const UserHashCode = require("../models/userAppHashcode");
const { app } = require("firebase-admin");

const otpApiEndpoint = "https://onlysms.co.in/api/otp.aspx";
const smsApiEndpoint = "https://onlysms.co.in/api/sms.aspx";

// Random hash generator
function generateRandomHash(length = 11) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let hash = '';
  for (let i = 0; i < length; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

exports.smsSender = async (phone, type, data) => {
  let message = "";
  let apiEndpoint = "";
  if (type === "otp") {

    const randomHash = generateRandomHash(); //portal

    message = `Dear user, your OTP is ${data.otp}. - COLLAB COLONY PRIVATE LIMITED\nI2ACJWofPjH`;
    apiEndpoint = otpApiEndpoint;
  }
  const encodedMessage = encodeURIComponent(message);

  const fullUrl =
    `${apiEndpoint}` +
    `?UserID=${process.env.SMS_USER_ID}` +
    `&UserPass=${process.env.SMS_USER_PASS}` +
    `&MobileNo=${phone}` +
    `&GSMID=${process.env.SMS_GSMID}` +
    `&PEID=${process.env.SMS_PEID}` +
    `&Message=${encodedMessage}` +
    `&TEMPID=${process.env.SMS_TEMPID}` +
    `&UNICODE=${process.env.SMS_UNICODE}`;

  try {
    const response = await axios.get(fullUrl);
    console.log(response.data);

    return response.data;
  } catch (error) {
    console.error("HTTP Request Error:", error.message);
  }
};
