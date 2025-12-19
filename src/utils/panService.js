const axios = require("axios");
require("dotenv").config();

const IDTO_URL = process.env.IDTO_BASE_URL || "https://prod.idto.ai";
const API_KEY = process.env.IDTO_API_KEY;
const CLIENT_ID = process.env.IDTO_CLIENT_ID;

exports.verifyPANService = async (panNumber) => {
    const panRegex = /^([A-Z]{5})([0-9]{4})([A-Z]{1})$/;

    if (!panRegex.test(panNumber.toUpperCase())) {
        throw new Error("Invalid PAN format. Please ensure 10 characters and correct capitalization.");
    }
    try {
        const payload = { pan_number: panNumber.toUpperCase() };

        const response = await axios.post(`${IDTO_URL}/verify/pan_verification`, payload, {
            headers: {
                "X-API-KEY": API_KEY,
                "X-Client-ID": CLIENT_ID,
                "accept": "application/json",
                "content-type": "application/json",
            },
        });

        return response.data;
    } catch (error) {
        console.log("Service Error:", error.message);
        throw error;
    }
}


