const { Op } = require('sequelize');

const Booking = require('../src/models/bookRoom');
const Rooms = require('../src/models/rooms');
const Property = require('../src/models/property');
const User = require('../src/models/user');
require('../src/models');
const { getRoomUsers } = require('../src/utils/aliste/alisteApi');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { propertyId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property') out.propertyId = args[++i];
  }
  return out;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

async function main() {
  const { propertyId } = parseArgs();

  const roomWhere = { alisteRoomId: { [Op.ne]: null } };
  if (propertyId) roomWhere.propertyId = propertyId;

  const rooms = await Rooms.findAll({
    where: roomWhere,
    include: [{ model: Property, as: 'property' }],
  });

  const alisteOccupancyByPhone = new Map();
  const alisteRoomDump = [];

  for (const room of rooms) {
    let resp;
    try {
      resp = await getRoomUsers(room.alisteRoomId);
    } catch (err) {
      console.error(`Failed to fetch Aliste occupants for room ${room.roomNumber} (${room.alisteRoomId}):`, err.message);
      continue;
    }

    if (!resp || !resp.success) {
      console.warn(`Aliste returned an error for room ${room.roomNumber} (${room.alisteRoomId}):`, resp && resp.raw);
      continue;
    }

    const alisteUsers = resp.body?.data?.room?.users || [];

    for (const au of alisteUsers) {
      const phone = normalizePhone(au.mobile);
      if (!phone) continue;

      alisteOccupancyByPhone.set(phone, {
        localRoom: room,
        alisteRoomId: room.alisteRoomId,
        alisteUser: au,
      });

      alisteRoomDump.push({ phone, room, alisteUser: au });
    }
  }

  const propertyIdsInScope = propertyId
    ? [propertyId]
    : [...new Set(rooms.map(r => r.propertyId))];

  const allRoomsInScope = await Rooms.findAll({
    where: { propertyId: { [Op.in]: propertyIdsInScope } },
  });
  const roomIds = allRoomsInScope.map(r => r.id);

  const bookings = await Booking.findAll({
    where: {
      roomId: { [Op.in]: roomIds },
      status: 'approved',
    },
    include: [
      { model: User, as: 'user' },
      { model: Rooms, as: 'room' },
    ],
  });

  const summary = [];

  for (const booking of bookings) {
    const phone = normalizePhone(booking.user?.phone);
    const currentRoom = booking.room;

    let foundOnAliste = phone ? alisteOccupancyByPhone.get(phone) : null;
    if (!foundOnAliste && booking.alisteUserId) {
      const byUserId = alisteRoomDump.find(e => e.alisteUser.userId === booking.alisteUserId);
      if (byUserId) {
        foundOnAliste = { localRoom: byUserId.room, alisteRoomId: byUserId.room.alisteRoomId, alisteUser: byUserId.alisteUser };
      }
    }

    summary.push({
      fullName: booking.user?.fullName || '',
      email: booking.user?.email || '',
      phone: booking.user?.phone || '',
      bookingRoomNumber: currentRoom?.roomNumber || '',
      alisteRoomNumber: foundOnAliste ? foundOnAliste.localRoom.roomNumber : '',
      checkInDate: booking.checkInDate || '',
      checkOutDate: booking.checkOutDate || '',
    });
  }

  console.log('\n========== ALISTE OCCUPANCY SUMMARY ==========\n');
  console.log('Full Name, Email, Phone, Booking Room, Aliste Room, Check-In, Check-Out');
  for (const row of summary) {
    console.log(`${row.fullName}, ${row.email}, ${row.phone}, ${row.bookingRoomNumber}, ${row.alisteRoomNumber}, ${row.checkInDate}, ${row.checkOutDate}`);
  }
  console.log(`\nTotal bookings: ${summary.length}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});