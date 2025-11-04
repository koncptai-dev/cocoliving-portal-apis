const ActivityLog= require("../models/activityLogs");

exports.logActivity=async({userId,name,role,action,entityType,entityId,details})=>{
    try{
        await ActivityLog.create({
            userId,name,role,action,entityType,entityId,details
        })
    }catch(error){
        console.log("Failed to log activity:",error);
    }
}