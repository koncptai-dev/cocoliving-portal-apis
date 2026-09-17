const { Op } = require('sequelize');

const Booking = require('../src/models/bookRoom');
const Rooms = require('../src/models/rooms');
const Property = require('../src/models/property');
const User = require('../src/models/user');

const {
  getRoomUsers,
  addUserToRoom,
  removeUserFromRoom,
} = require('../src/utils/aliste/alisteApi');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { mode: 'dry-run', propertyId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') out.mode = args[++i];
    if (args[i] === '--property') out.propertyId = args[++i];
  }
  if (!['dry-run', 'write'].includes(out.mode)) {
    console.error('--mode must be "dry-run" or "write"');
    process.exit(1);
  }
  return out;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const { mode, propertyId } = parseArgs();
  const isWrite = mode === 'write';

  console.log(`\n========== reconcileAlisteOccupancy.js — mode: ${mode.toUpperCase()} ==========\n`);

  const roomWhere = { alisteRoomId: { [Op.ne]: null } };
  if (propertyId) roomWhere.propertyId = propertyId;

  const rooms = await Rooms.findAll({
    where: roomWhere,
    include: [{ model: Property, as: 'property' }],
  });

  console.log(`Found ${rooms.length} rooms with alisteRoomId set.\n`);

  const alisteOccupancyByPhone = new Map();
  const alisteRoomDump = [];

  for (const room of rooms) {
    let resp;
    try {
      resp = await getRoomUsers(room.alisteRoomId);
    } catch (err) {
      console.error(`⚠️  Failed to fetch Aliste occupants for room ${room.roomNumber} (${room.alisteRoomId}):`, err.message);
      continue;
    }

    if (!resp || !resp.success) {
      console.warn(`⚠️  Aliste returned an error for room ${room.roomNumber} (${room.alisteRoomId}):`, resp && resp.raw);
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

  console.log(`Aliste reports ${alisteOccupancyByPhone.size} distinct occupied phone numbers across these rooms.\n`);
  const today = todayStr();

  const propertyIdsInScope = propertyId
    ? [propertyId]
    : [...new Set(rooms.map(r => r.propertyId))];

  const allRoomsInScope = await Rooms.findAll({
    where: { propertyId: { [Op.in]: propertyIdsInScope } },
  });
  const roomIds = allRoomsInScope.map(r => r.id);

  const activeBookings = await Booking.findAll({
    where: {
      roomId: { [Op.in]: roomIds },
      status: 'approved',
      checkInDate: { [Op.lte]: today },
      checkOutDate: { [Op.gte]: today },
    },
    include: [
      { model: User, as: 'user' },
      { model: Rooms, as: 'room' },
    ],
  });

  console.log(`Found ${activeBookings.length} active bookings in scope.\n`);
  const actions = [];
  const matchedPhones = new Set();
  for (const booking of activeBookings) {
    const phone = normalizePhone(booking.user?.phone);
    matchedPhones.add(phone);

    const currentRoom = booking.room;
    if (!currentRoom?.alisteRoomId) {
      actions.push({
        type: 'ROOM_NOT_SYNCED',
        booking,
        currentRoom,
        reason: `Booking's room ${currentRoom?.roomNumber} has no alisteRoomId yet — run the room-sync script first.`,
      });
      continue;
    }

    let foundOnAliste = phone ? alisteOccupancyByPhone.get(phone) : null;
    if (!foundOnAliste && booking.alisteUserId) {
      const byUserId = alisteRoomDump.find(e => e.alisteUser.userId === booking.alisteUserId);
      if (byUserId) {
        foundOnAliste = { localRoom: byUserId.room, alisteRoomId: byUserId.room.alisteRoomId, alisteUser: byUserId.alisteUser };
      }
    }

    if (!foundOnAliste) {
      actions.push({
        type: 'NEEDS_ADD',
        booking,
        currentRoom,
        reason: `Not attached to any Aliste room. Needs add to ${currentRoom.roomNumber} (alisteRoomId ${currentRoom.alisteRoomId}).`,
      });
      continue;
    }

    if (foundOnAliste.alisteRoomId === currentRoom.alisteRoomId) {
      actions.push({ type: 'OK', booking, currentRoom, reason: 'Already correctly placed.' });
      continue;
    }

    actions.push({
      type: 'NEEDS_MOVE',
      booking,
      currentRoom,
      wrongRoom: foundOnAliste.localRoom,
      reason: `Aliste has them in room ${foundOnAliste.localRoom.roomNumber} (property ${foundOnAliste.localRoom.property?.name || foundOnAliste.localRoom.propertyId}), but they should be in ${currentRoom.roomNumber}.`,
    });
  }
  const orphans = alisteRoomDump.filter(e => !matchedPhones.has(e.phone));
  console.log('\n========== DIFF REPORT ==========\n');

  const byType = { NEEDS_ADD: [], NEEDS_MOVE: [], OK: [], ROOM_NOT_SYNCED: [] };
  actions.forEach(a => byType[a.type].push(a));

  console.log(`OK (no action):        ${byType.OK.length}`);
  console.log(`NEEDS_ADD:             ${byType.NEEDS_ADD.length}`);
  console.log(`NEEDS_MOVE:            ${byType.NEEDS_MOVE.length}`);
  console.log(`ROOM_NOT_SYNCED:       ${byType.ROOM_NOT_SYNCED.length} (flagged only, run room-sync first)`);
  console.log(`ORPHAN_ALISTE_USER:    ${orphans.length} (flagged only, never auto-touched)\n`);

  for (const a of byType.NEEDS_ADD) {
    console.log(`[NEEDS_ADD]  booking #${a.booking.id} (${a.booking.user?.fullName}, ${a.booking.user?.phone}) -> room ${a.currentRoom.roomNumber}`);
  }
  for (const a of byType.NEEDS_MOVE) {
    console.log(`[NEEDS_MOVE] booking #${a.booking.id} (${a.booking.user?.fullName}, ${a.booking.user?.phone}) : aliste has room ${a.wrongRoom.roomNumber} -> should be ${a.currentRoom.roomNumber}`);
  }
  for (const a of byType.ROOM_NOT_SYNCED) {
    console.log(`[ROOM_NOT_SYNCED] booking #${a.booking.id} (${a.booking.user?.fullName}, ${a.booking.user?.phone}) : room ${a.currentRoom?.roomNumber} has no alisteRoomId — needs room-sync first, not touched.`);
  }
  for (const o of orphans) {
    console.log(`[ORPHAN]     Aliste user "${o.alisteUser.name}" (${o.phone}) in room ${o.room.roomNumber} (property ${o.room.property?.name}) — no matching active booking found. NOT TOUCHED — needs manual review.`);
  }

  if (!isWrite) {
    console.log('\nDry run only — nothing was changed.\n');
    process.exit(0);
  }
  console.log('\n========== APPLYING CHANGES ==========\n');
  for (const a of byType.NEEDS_ADD) {
    const { booking, currentRoom } = a;
    const bookingUser = booking.user;

    try {
      const payloadUserId = booking.alisteUserId || `USER_${booking.id}`;
      const resp = await addUserToRoom({
        roomId: currentRoom.alisteRoomId,
        userId: payloadUserId,
        phoneNumber: bookingUser?.phone,
        firstName: bookingUser?.fullName?.split(' ')[0] || 'User',
        lastName: bookingUser?.fullName?.split(' ').slice(1).join(' ') || '',
        email: bookingUser?.email,
      });

      if (resp && resp.success) {
        booking.alisteUserId = payloadUserId;
        booking.removedUserFromAliste = false;
        await booking.save();
        console.log(`✅ Added booking #${booking.id} to room ${currentRoom.roomNumber}`);
      } else {
        console.error(`❌ Add failed for booking #${booking.id}:`, resp && resp.raw ? resp.raw : resp);
      }
    } catch (err) {
      console.error(`❌ Error adding booking #${booking.id}:`, err.message);
    }
  }

  for (const a of byType.NEEDS_MOVE) {
    const { booking, currentRoom, wrongRoom } = a;
    const bookingUser = booking.user;

    try {
      const removeResp = await removeUserFromRoom({
        roomId: wrongRoom.alisteRoomId,
        phoneNumber: bookingUser?.phone,
      });

      if (!removeResp || !removeResp.success) {
        console.error(`❌ Could not remove booking #${booking.id} from wrong room ${wrongRoom.roomNumber} — aborting move, not attempting add:`, removeResp && removeResp.raw);
        continue;
      }
      const payloadUserId = booking.alisteUserId || `USER_${booking.id}`;
      const addResp = await addUserToRoom({
        roomId: currentRoom.alisteRoomId,
        userId: payloadUserId,
        phoneNumber: bookingUser?.phone,
        firstName: bookingUser?.fullName?.split(' ')[0] || 'User',
        lastName: bookingUser?.fullName?.split(' ').slice(1).join(' ') || '',
        email: bookingUser?.email,
      });

      if (addResp && addResp.success) {
        booking.alisteUserId = payloadUserId;
        booking.removedUserFromAliste = false;
        await booking.save();
        console.log(`✅ Moved booking #${booking.id}: ${wrongRoom.roomNumber} -> ${currentRoom.roomNumber}`);
      } else {
        console.error(`⚠️  REMOVED from ${wrongRoom.roomNumber} but FAILED to add to ${currentRoom.roomNumber} for booking #${booking.id}. User is currently unattached on Aliste — needs manual follow-up:`, addResp && addResp.raw ? addResp.raw : addResp);
      }
    } catch (err) {
      console.error(`❌ Error moving booking #${booking.id}:`, err.message);
    }
  }

  console.log('\nOrphans were NOT touched — review the ORPHAN_ALISTE_USER list above manually.\n');
  console.log(`\n========== reconcileAlisteOccupancy.js — mode: ${mode.toUpperCase()} — done ==========\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});