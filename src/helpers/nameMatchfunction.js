const axios = require("axios");
require("dotenv").config();

const IDTO_URL = process.env.IDTO_BASE_URL || "https://prod.idto.ai";
const API_KEY = process.env.IDTO_API_KEY;
const CLIENT_ID = process.env.IDTO_CLIENT_ID;


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