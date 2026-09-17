const fs = require('fs');
const path = require('path');

const Booking = require('../models/bookRoom');
const Rooms = require('../models/rooms');
const Property = require('../models/property');
const User = require('../models/user');
const { sequelize, Op } = require('../models');
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { file: null, mode: 'dry-run' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') out.file = args[++i];
    if (args[i] === '--mode') out.mode = args[++i];
  }
  if (!out.file) {
    console.error('Usage: node changeRoomNumber.js --file <path-to-sheet.csv> --mode <dry-run|write>');
    process.exit(1);
  }
  if (!['dry-run', 'write'].includes(out.mode)) {
    console.error('--mode must be "dry-run" or "write"');
    process.exit(1);
  }
  return out;
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const splitLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    return row;
  });
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.slice(-10);
}

function logLine(mode, msg) {
  console.log(`[${mode.toUpperCase()}] ${msg}`);
}

async function main() {
  const { file, mode } = parseArgs();
  const isWrite = mode === 'write';

  console.log(`\n========== changeRoomNumber.js — mode: ${mode.toUpperCase()} ==========\n`);

  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const rows = parseCsv(raw);
  console.log(`Loaded ${rows.length} rows from ${file}\n`);

  const results = [];
  const propertyIdsSeen = new Set();
  const statusCountCache = new Map();

  async function getStatusCount(roomId) {
    if (!statusCountCache.has(roomId)) {
      const c = await Booking.count({
        where: { roomId, status: { [Op.in]: ['approved', 'active'] } },
      });
      statusCountCache.set(roomId, c);
    }
    return statusCountCache.get(roomId);
  }

  function bumpRoomCounts(roomId, delta) {
    statusCountCache.set(roomId, (statusCountCache.get(roomId) || 0) + delta);
  }

  for (const row of rows) {
    const propertyName = (row['Property Name'] || '').trim();
    const phoneRaw = row['Resident Phone'] || '';
    const targetRoomNumberRaw = (row['Room Number'] || row['Room Number '] || '').trim();
    const sheetCurrentRoomNumberRaw = (row['SYSTEM ROOM NO'] || '').trim();

    const phone = normalizePhone(phoneRaw);
    const entry = {
      propertyName,
      phone: phoneRaw,
      targetRoomNumber: targetRoomNumberRaw,
      sheetCurrentRoomNumber: sheetCurrentRoomNumberRaw,
      status: null,
      reason: null,
    };

    if (!phone || !propertyName || !targetRoomNumberRaw || targetRoomNumberRaw === '#N/A') {
      entry.status = 'SKIP';
      entry.reason = 'Missing phone, property, or target room number in sheet row';
      logLine(mode, `SKIP  ${propertyName || '(no property)'} | ${phoneRaw || '(no phone)'} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    const property = await Property.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('name'))),
        propertyName.toLowerCase()
      ),
    });

    if (!property) {
      entry.status = 'ERROR';
      entry.reason = `No property found matching "${propertyName}"`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    propertyIdsSeen.add(property.id);
    const user = await User.findOne({
      where: sequelize.where(
        sequelize.fn('RIGHT', sequelize.col('phone'), 10),
        phone
      ),
    });

    if (!user) {
      entry.status = 'ERROR';
      entry.reason = `No user found with phone ending in ${phone}`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    const booking = await Booking.findOne({
      where: {
        userId: user.id,
        status: { [Op.in]: ['approved', 'active'] },
      },
      include: [{ model: Rooms, as: 'room', include: [{ model: Property, as: 'property' }] }],
      order: [['createdAt', 'DESC']],
    });

    if (!booking) {
      entry.status = 'ERROR';
      entry.reason = `No active booking found for ${user.fullName || phone}`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    if (booking.room?.propertyId !== property.id) {
      entry.status = 'ERROR';
      entry.reason = `Booking's current property doesn't match sheet's property (booking is in "${booking.room?.property?.name}", sheet says "${propertyName}")`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    if (
      sheetCurrentRoomNumberRaw &&
      sheetCurrentRoomNumberRaw !== '#N/A' &&
      String(booking.room?.roomNumber) !== sheetCurrentRoomNumberRaw
    ) {
      entry.status = 'ERROR';
      entry.reason = `Sheet says current room is ${sheetCurrentRoomNumberRaw}, but DB has booking in room ${booking.room?.roomNumber} — mismatch, not touching this row`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    if (String(booking.room?.roomNumber) === targetRoomNumberRaw) {
      entry.status = 'SKIP';
      entry.reason = 'Already in the target room';
      logLine(mode, `SKIP  ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    const targetRoom = await Rooms.findOne({
      where: {
        propertyId: property.id,
        roomNumber: targetRoomNumberRaw,
      },
    });

    if (!targetRoom) {
      entry.status = 'ERROR';
      entry.reason = `Target room ${targetRoomNumberRaw} not found in property "${propertyName}"`;
      logLine(mode, `ERROR ${propertyName} | ${phoneRaw} | ${entry.reason}`);
      results.push(entry);
      continue;
    }

    const oldRoom = booking.room;
    bumpRoomCounts(oldRoom.id, -1);
    bumpRoomCounts(targetRoom.id, +1);

    const oldRoomNewStatusCount = await getStatusCount(oldRoom.id);
    const oldRoomNewStatus = oldRoomNewStatusCount >= oldRoom.capacity ? 'booked' : 'available';
    const newRoomNewStatusCount = await getStatusCount(targetRoom.id);
    const newRoomNewStatus = newRoomNewStatusCount >= targetRoom.capacity ? 'booked' : 'available';
    const targetOverCapacity = newRoomNewStatusCount > targetRoom.capacity;

    entry.status = 'OK';
    entry.reason =
      `Move booking #${booking.id} (${user.fullName || phone}) from room ${oldRoom.roomNumber} -> ${targetRoomNumberRaw}. ` +
      `Old room status label -> ${oldRoomNewStatus} (${oldRoomNewStatusCount}/${oldRoom.capacity}), ` +
      `new room status label -> ${newRoomNewStatus} (${newRoomNewStatusCount}/${targetRoom.capacity})` +
      `${targetOverCapacity ? ' [NOTE: target room will be OVER CAPACITY after this move — proceeding anyway, per instruction]' : ''}. ` +
      `(Aliste not touched by this script — run reconcileAlisteOccupancy.js afterward.)`;

    logLine(mode, `${isWrite ? 'APPLY' : 'WOULD APPLY'} ${propertyName} | ${phoneRaw} | ${entry.reason}`);

    if (!isWrite) {
      results.push(entry);
      continue;
    }

    const t = await sequelize.transaction();
    try {
      booking.roomId = targetRoom.id;
      await booking.save({ transaction: t });

      oldRoom.status = oldRoomNewStatus;
      await oldRoom.save({ transaction: t });

      targetRoom.status = newRoomNewStatus;
      await targetRoom.save({ transaction: t });

      await t.commit();
      entry.status = 'DONE';
      logLine(mode, `DONE  booking #${booking.id} committed.`);
    } catch (err) {
      await t.rollback();
      entry.status = 'ERROR';
      entry.reason = `Write failed: ${err.message}`;
      bumpRoomCounts(oldRoom.id, +1);
      bumpRoomCounts(targetRoom.id, -1);
      console.error(`❌ Failed to move booking for phone ${phone}:`, err);
    }

    results.push(entry);
  }

  const roomStatusRecomputes = [];

  if (propertyIdsSeen.size > 0) {
    console.log(`\n========== ${isWrite ? 'RECOMPUTING' : 'PREVIEWING RECOMPUTE OF'} ROOM STATUS LABELS FOR ALL ROOMS IN AFFECTED PROPERTIES ==========\n`);

    const allRoomsInAffectedProperties = await Rooms.findAll({
      where: { propertyId: { [Op.in]: [...propertyIdsSeen] } },
    });

    for (const room of allRoomsInAffectedProperties) {
      const activeCount = await getStatusCount(room.id);
      const newStatus = activeCount >= room.capacity ? 'booked' : 'available';

      if (room.status !== newStatus) {
        const before = room.status;
        roomStatusRecomputes.push({ roomNumber: room.roomNumber, before, after: newStatus, activeCount, capacity: room.capacity });
        logLine(mode, `Room ${room.roomNumber}: ${before} -> ${newStatus} (${activeCount}/${room.capacity} occupied)`);

        if (isWrite) {
          room.status = newStatus;
          await room.save();
        }
      }
    }

    console.log(`\n${roomStatusRecomputes.length} room(s) ${isWrite ? 'had their status label corrected' : 'would have their status label corrected'} out of ${allRoomsInAffectedProperties.length} checked.\n`);
  }
  console.log('\n========== SUMMARY ==========\n');
  for (const r of results) {
    console.log(
      `[${r.status}] ${r.propertyName} | phone ${r.phone} | ${r.sheetCurrentRoomNumber} -> ${r.targetRoomNumber}\n   ${r.reason}\n`
    );
  }

  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  console.log('Counts:', counts);
  console.log(`Room status-label corrections ${isWrite ? 'made' : 'that would be made'}: ${roomStatusRecomputes.length}`);
  console.log(`\n========== changeRoomNumber.js — mode: ${mode.toUpperCase()} — done ==========\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});