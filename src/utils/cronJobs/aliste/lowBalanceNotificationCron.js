const cron = require('node-cron');

const Property = require('../../../models/property');
const Rooms = require('../../../models/rooms');
const Booking = require('../../../models/bookRoom');
const User = require('../../../models/user');

const {
  getRoomDetails,
} = require('../../../utils/aliste/alisteApi');

const {
  getCronSchedule,
} = require('../../../utils/aliste/cronSchedule');

const {
  notifyLowElectricityBalance,
} = require('../../notificationService');

const schedule = getCronSchedule(
  '0 10,17 * * *'
);

cron.schedule(
  schedule,
  async () => {
    console.log(
      '\n🕒 Running Low Balance Cron...'
    );

    try {
      const rooms = await Rooms.findAll({
        where: {
          alisteRoomId: {
            [require('sequelize').Op.ne]:
              null,
          },
        },

        include: [
          {
            model: Property,
            as: 'property',
          },
          {
            model: Booking,
            as: 'bookings',
            where: {
              status: 'approved',
            },
            required: false,
            include: [
              {
                model: User,
                as: 'user',
              },
            ],
          },
        ],
      });

      console.log(
        `Found ${rooms.length} rooms`
      );

      for (const room of rooms) {
        try {
          const response =
            await getRoomDetails(
              room.alisteRoomId
            );

          const roomData =
            response?.body?.data;

          if (!roomData) {
            continue;
          }

          const balance = Number(
            roomData.balance || 0
          );

          const minimumBalance =
            Number(
              room.property
                ?.minimumBalance || 0
            );

          console.log({
            room: room.roomNumber,
            balance,
            minimumBalance,
          });

          if (
            balance > minimumBalance
          ) {
            continue;
          }

          for (const booking of room.bookings) {
            console.log(
              `⚠️ Low balance notification for booking ${booking.id}`
            );
            await notifyLowElectricityBalance(
                booking,
                balance,
                minimumBalance
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed room ${room.id}`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        '🔥 Low Balance Cron Error:',
        error.message
      );
    }
  },
  {
    timezone: 'Asia/Kolkata',
  }
);