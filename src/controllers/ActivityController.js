const ActivityLog=require("../models/activityLogs");
const sequelize = require('../config/database');


exports.getRecentActivities=async(req,res)=>{
        try{
            const logs=await ActivityLog.findAll({
                order:[["createdAt","DESC"]],
                limit:10
            })
            res.json({activities:logs})
        }
        catch(err){
            res.status(500).json({ message: err.message });
        }
}