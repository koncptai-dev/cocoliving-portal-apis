const sequelize = require('../config/database');
const Booking=require('../models/bookRoom');
const Rooms=require('../models/rooms');
const User=require('../models/user');
const { Op } = require('sequelize');
const moment = require('moment');

exports.createBooking=async(req,res)=>{
    try{

        const{roomId,checkInDate,checkOutDate,notes}=req.body;
        const userId=req.user.id;

        let checkInDateFormatted = moment(checkInDate, ["DD-MM-YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD");
        let checkOutDateFormatted = moment(checkOutDate, ["DD-MM-YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD");
    
        //check room exist
        const room=await Rooms.findByPk(roomId);
        if(!room){
            return res.status(404).json({ message: "Room not found" });
        }
    
        //check active bookings for this room
        const activeBookings=await Booking.count({
          where:{roomId,status:"booked"}
        })

        //check if same user already booked this room
        const existingBooking = await Booking.findOne({
          where: { userId, roomId, status: "booked" }
        });
        
        if (existingBooking) {
          return res.status(400).json({ message: "You have already booked this room" });
        }

        //if already full
        if(activeBookings>=room.capacity){
          return res.status(400).json({ message: "Room is fully booked" });
        }
    
        const booking = await Booking.create({
          userId,
          roomId,
          checkInDate: checkInDateFormatted,
          checkOutDate: checkOutDateFormatted,
          monthlyRent: room.monthlyRent, 
          depositAmount: room.depositAmount,
          notes,
          status: "booked",
        });
    
      //  recalc occupancy and update room status
        const currentBookings = await Booking.count({
          where: { roomId, status: "booked" }
        });
        room.status = currentBookings >= room.capacity ? "booked" : "available";
        await room.save();

    res.status(201).json({ message: "Booking successful", booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}


//get all booking for admin

exports.getAllBookings=async(req,res)=>{
  try{
    const booking=await Booking.findAll({
      include:[{
        model:User,attributes:["id","fullName"]
      },{model:Rooms,as: "room",attributes:["id","roomNumber"]}]
    })

    res.status(200).json({ booking });
  }catch(err){
    console.log("error",err);
    return res.status(500).json({message:"Internal server error"});
  }

}