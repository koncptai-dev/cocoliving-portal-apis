const sequelize = require('../config/database');
const Rooms = require('../models/rooms');
const Booking=require('../models/bookRoom');
const { Op } = require('sequelize');


//Add Rooms 
exports.AddRooms=async(req,res)=>{
    try{
        const{roomNumber,roomType,capacity,floorNumber,monthlyRent,depositAmount,preferredUserType,amenities,description,availableForBooking}=req.body;

        //check rooms are exist -> unique room number

        const existingRoom=await Rooms.findOne({where:{roomNumber}});
        if(existingRoom){
            return res.status(400).json({message:"Room already exists"});
        }

        const status=availableForBooking?"available":"sold";

        const newRooms=await Rooms.create({
            roomNumber,roomType, capacity, floorNumber,  monthlyRent, depositAmount, preferredUserType,
             amenities, description,status
        })

        res.status(201).json({message:'Rooms added successfully', room:newRooms})

    }catch(err){
        console.log("error->", err
        );
        
        return res.status(500).json({message:"Internal server error"});
    }
}

//Edit Rooms
exports.EditRooms=async(req,res)=>{
    try{
        const {id}=req.params;
        const updatedData=req.body;

        //find existing room
        const room= await Rooms.findByPk(id);
        if(!room){
            return res.status(404).json({message:"Room not found"});
        }

        //check duplicate room number 
        if(updatedData.roomNumber && updatedData.roomNumber !== room.roomNumber){
            const exist = await Rooms.findOne({where:{roomNumber:updatedData.roomNumber}});
            if(exist){
                return res.status(400).json({message:"Room number already exists"});
            }
        }

        // Update status if availableForBooking is passed
        if (updatedData.availableForBooking !== undefined) {
            updatedData.status = updatedData.availableForBooking ? "available" : "sold";
        }

        //apply update dynamically
        await room.update(updatedData);

        res.status(200).json({message:"Room updated successfully", room});

    }catch(err){
        console.log("error",err);
        
        return res.status(500).json({message:"Internal server error"});
    }
}

//delete Rooms
exports.DeleteRooms=async(req,res)=>{
    try{

        const{id}=req.params;
        
        const room=await Rooms.findByPk(id);
        if(!room){
            return res.status(404).json({message:"Room not found"});
        }

        await room.destroy();
        res.status(200).json({message:"Room deleted successfully"});

    }catch(err){
        console.log("error",err);
        
        return res.status(500).json({message:"Internal server error"});
    }
}

//get Rooms
exports.getAllRooms=async(req,res)=>{
    try{
        const rooms=await Rooms.findAll(
            {
                include:[
                    {
                        model:Booking,
                        as:'bookings',
                        where:{status:'booked'}
                    }
                ]
            }
        )

        const formattedRooms=rooms.map((room)=>{
            const capacity=room.capacity;
            const occupied=room.bookings ? room.bookings.length : 0;

            return{
                roomNumber: room.roomNumber,
                roomType: room.roomType,
                capacity:capacity,
                monthlyRent: room.monthlyRent,
                status: room.status,
                occupancy:`${occupied}/${capacity}`
            }
        })

        res.status(200).json({rooms:formattedRooms});
    }catch(err){
        console.log("error",err);
        
        return res.status(500).json({message:"Internal server error"});
    }
    
}