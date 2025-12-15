const axios = require("axios");
require("dotenv").config();

const otpApiEndpoint = "https://onlysms.co.in/api/otp.aspx";
const smsApiEndpoint = "https://onlysms.co.in/api/sms.aspx";

exports.smsSender = async (phone, type, data) => {
  let message = "";
  let apiEndpoint = "";
  if (type === "otp") {
    message = `Dear user, your OTP is ${data.otp}. - COLLAB COLONY PRIVATE LIMITED`;
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
