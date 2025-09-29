const sequelize = require('../config/database');
const Booking=require('../models/bookRoom');
const Rooms=require('../models/rooms');
const Property=require('../models/property');
const User=require('../models/user');
const { Op } = require('sequelize');
const moment = require('moment');


//get all booking for admin
exports.getAllBookings=async(req,res)=>{
  try{
    const booking=await Booking.findAll({
      include:[{
        model:User,as:'user',attributes:["id","fullName","email","phone","gender"]
      },{model:Rooms,as: "room",attributes:["id","roomNumber"], include: [{ model: Property, as: 'property' }]}]
    })

    res.status(200).json({ booking });
  }catch(err){
    console.log("error",err);
    return res.status(500).json({message:"Internal server error"});
  }

} 

//approve booking request
exports.approveBooking=async(req,res)=>{
  try{
    const {bookingId}=req.params;

    const booking=await Booking.findByPk(bookingId,{
      include:[{model:Rooms,as:"room"}]
    });
    if(!booking){
      res.status(404).json({message:"Booking not found"});
    }
    booking.status = "approved";
    await booking.save();

     // Update room status based on capacity
    const room = await Rooms.findByPk(booking.roomId);
    const currentBookings = await Booking.count({
      where: { roomId: room.id, status: {[Op.in]:["approved", "active"] }}
    });
    room.status = currentBookings >= room.capacity ? "booked" : "available";
    await room.save();

    res.status(200).json({ message: "Booking approved successfully", booking });
  }catch(err){
    console.log("error",err);
    return res.status(500).json({message:"Internal server error"});
  }
}

exports.rejectBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "rejected";
    await booking.save();

    // Update room status (only if no other active/approved booking exists)
    const room = await Rooms.findByPk(booking.roomId);
    const activeBookings = await Booking.count({
      where: { roomId: room.id, status: {[Op.in]:["approved", "active"]} }
    });
    room.status = activeBookings > 0 ? "booked" : "available";
    await room.save();

    res.status(200).json({ message: "Booking rejected", booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
