const axios = require("axios");
require("dotenv").config();

exports.smsSender = async (phone, type, data) => {
  let message = "";
  let apiEndpoint = "";
  if (type === "otp") {
    message = `Dear user, your OTP is ${data.otp}. - COLLAB COLONY PRIVATE LIMITED`;
    apiEndpoint = "https://onlysms.co.in/api/otp.aspx";
  }
  const encodedMessage = encodeURIComponent(message);

  const fullUrl =
    `${apiEndpoint}` +
    `?UserID=${process.env.OTP_USER_ID}` +
    `&UserPass=${process.env.OTP_USER_PASS}` +
    `&MobileNo=${phone}` +
    `&GSMID=${process.env.OTP_GSMID}` +
    `&PEID=${process.env.OTP_PEID}` +
    `&Message=${encodedMessage}` +
    `&TEMPID=${process.env.OTP_TEMPID}` +
    `&UNICODE=${process.env.OTP_UNICODE}`;

  try {
    const response = await axios.get(fullUrl);
    console.log(response.data);

    return response.data;
  } catch (error) {
    console.error("HTTP Request Error:", error.message);
  }
};
