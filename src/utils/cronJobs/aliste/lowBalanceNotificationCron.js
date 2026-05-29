const cron = require('node-cron');
const { Op } = require('sequelize');

const Property = require('../../../models/property');
const Rooms = require('../../../models/rooms');
const Booking = require('../../../models/bookRoom');
const User = require('../../../models/user');

const {
  getPropertyRooms,
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
      const today = new Date();

      const properties =
        await Property.findAll({
          where: {
            alistePropertyId: {
              [Op.ne]: null,
            },
          },
        });

      console.log(
        `Found ${properties.length} integrated properties`
      );

      for (const property of properties) {
        try {
          console.log(
            `Checking property ${property.id}`
          );

          const response =
            await getPropertyRooms(
              property.alistePropertyId
            );

          const alisteRooms =
            response?.body?.data?.room ||
            response?.body?.data?.rooms ||
            [];

          if (!Array.isArray(alisteRooms)) {
            console.log(
              'No rooms returned from Aliste'
            );
            continue;
          }

          const lowBalanceRooms =
            alisteRooms.filter(room => {
              const balance = Number(
                room.balance || 0
              );

              return (
                balance <
                Number(
                  property.minimumBalance || 0
                ) + 200
              );
            });

          console.log(
            `Found ${lowBalanceRooms.length} low balance rooms`
          );

          if (!lowBalanceRooms.length) {
            continue;
          }

          const localRooms =
            await Rooms.findAll({
              where: {
                propertyId: property.id,
                alisteRoomId: {
                  [Op.ne]: null,
                },
              },
            });

          const roomMap = new Map(
            localRooms.map(room => [
              room.alisteRoomId,
              room,
            ])
          );

          for (const alisteRoom of lowBalanceRooms) {
            try {
              const localRoom =
                roomMap.get(
                  alisteRoom.alisteId
                );

              if (!localRoom) {
                console.log(
                  `No local mapping found for ${alisteRoom.alisteId}`
                );
                continue;
              }

              const bookings =
                await Booking.findAll({
                  where: {
                    roomId: localRoom.id,

                    status: 'approved',

                    checkInDate: {
                      [Op.lte]: today,
                    },

                    checkOutDate: {
                      [Op.gte]: today,
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
                `Room ${localRoom.roomNumber} has ${bookings.length} active occupants`
              );

              for (const booking of bookings) {
                await notifyLowElectricityBalance(
                  booking,
                  Number(
                    alisteRoom.balance || 0
                  ),
                  Number(
                    property.minimumBalance || 0
                  )
                );
              }
            } catch (roomError) {
              console.error(
                `Failed room ${alisteRoom.alisteId}`,
                roomError
              );
            }
          }
        } catch (propertyError) {
          console.error(
            `Failed property ${property.id}`,
            propertyError
          );
        }
      }
    } catch (error) {
      console.error(
        '🔥 Low Balance Cron Error:',
        error
      );
    }
  },
  {
    timezone: 'Asia/Kolkata',
  }
);