const axios = require("axios");
require("dotenv").config();

const IDTO_URL = process.env.IDTO_BASE_URL || "https://prod.idto.ai";
const API_KEY = process.env.IDTO_API_KEY;
const CLIENT_ID = process.env.IDTO_CLIENT_ID;


//for pancard and adharcard name match
exports.nameMatchService = async (name1, name2) => {

    console.log("========== NAME MATCH SERVICE ==========");
    console.log("Name1:",name1);
    console.log("Name2:",name2);
    console.log("IDTO_URL:",IDTO_URL);

    if (!name1 || !name2) {

        console.log("Name missing");

        return {
            success:false,
            matched:false,
            matchScore:0,
            message:"Name Missing"
        }
    }

    try {

        const payload = {
            name_1:name1,
            name_2:name2
        };

        console.log("Request payload:",payload);

        const headers = {
            "X-API-KEY":API_KEY,
            "X-Client-ID":CLIENT_ID,
            "Content-Type":"application/json"
        };

        console.log("Headers:",{
            "X-API-KEY": API_KEY ? "PRESENT":"MISSING",
            "X-Client-ID": CLIENT_ID ? "PRESENT":"MISSING"
        });

        const url = `${IDTO_URL}/verify/name_match`;

        console.log("Calling URL:",url);

        const response = await axios.post(
            url,
            payload,
            {headers}
        );

        console.log("Response status:",response.status);
        console.log("Response data:",response.data);

        const data = response.data;

        return {
            success: data?.status === "success",
            matched: data?.match_status === true,
            matchScore: data?.match_score || 0,
            rawResponse: data
        };

    } catch (error) {

        console.error("NAME MATCH ERROR:",error);

        if(error.response){
            console.error("Error status:",error.response.status);
            console.error("Error data:",error.response.data);
        }

        return {
            success: false,
            matched: false,
            matchScore: 0,
            error: error.response?.data || error.message
        };
    }
}