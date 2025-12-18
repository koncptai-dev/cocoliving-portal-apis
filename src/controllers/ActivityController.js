const ActivityLog=require("../models/activityLogs");
const sequelize = require('../config/database');
const { logApiCall } = require("../helpers/auditLog");


exports.getRecentActivities=async(req,res)=>{
        try{
            const logs=await ActivityLog.findAll({
                order:[["createdAt","DESC"]],
                limit:10
            })
            await logApiCall(req, res, 200, "Viewed recent activities", "activity");
            res.json({activities:logs})
        }
        catch(err){
            await logApiCall(req, res, 500, "Error occurred while fetching recent activities", "activity");
            res.status(500).json({ message: err.message });
        }
}