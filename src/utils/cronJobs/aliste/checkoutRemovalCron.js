const cron = require('node-cron');

const Booking = require('../../../models/bookRoom');
const User = require('../../../models/user');

const {
  removeUserFromRoom,
} = require('../../../utils/aliste/alisteApi');

const { Op } = require('sequelize');

const {
  getCronSchedule,
} = require('../../../utils/aliste/cronSchedule');

const schedule = getCronSchedule(
  '0 1 * * *'
);

cron.schedule(
  schedule,
  async () => {
    console.log(
      '\n🕒 Running Aliste Checkout Sync Cron...'
    );

    try {
      const yesterday = new Date();

      yesterday.setDate(
        yesterday.getDate() - 1
      );

      const dateStr =
        yesterday.toLocaleDateString(
          'en-CA'
        );

      const bookings =
        await Booking.findAll({
          where: {
            checkOutDate: {
              [Op.lte]: dateStr,
            },

            onboardingStatus:
              'COMPLETED',

            status: 'approved',

            removedUserFromAliste: false,

            alisteUserId: {
              [Op.ne]: null,
            },

            roomId: {
              [Op.ne]: null,
            },
          },

          include: [
            {
              model: User,
              as: 'user',
            },
          ],
        });

      console.log(
        `Found ${bookings.length} bookings`
      );

      for (const booking of bookings) {
        try {
          await removeUserFromRoom({
            roomId:
              booking.alisteRoomId,

            userId:
              booking.alisteUserId,

            phone:
              booking.user?.phone,
          });

          booking.removedUserFromAliste = true;

          await booking.save();

          console.log(
            `✅ Removed booking ${booking.id}`
          );
        } catch (error) {
          console.error(
            `❌ Failed booking ${booking.id}`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        '🔥 Checkout Cron Error:',
        error.message
      );
    }
  },
  {
    timezone: 'Asia/Kolkata',
  }
);