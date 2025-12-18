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


//for pancard and adharcard name match
exports.nameMatchService = async (name1, name2) => {
    if (!name1 || !name2) {
        return { success: false, matched: false, matchScore: 0, message: "Name Missing" }
    }

    try {
        const response = await axios.post(`${IDTO_URL}/verify/name_match`,
            {
                name_1: name1, name_2: name2
            },
            
            {
                headers: {
                    "X-API-KEY": API_KEY,
                    "X-Client-ID": CLIENT_ID,
                    "Content-Type": "application/json"
                }
            }
        );
        
        
        
        const data = response.data;
        return {
            success: data?.status === "success",
            matched: data?.match_status === true,
            matchScore: data?.match_score || 0,
            rawResponse: data
        };
    } catch (error) {
        return {
            success: false,
            matched: false,
            matchScore: 0,
            error: error.response?.data || error.message
        };
    }
}