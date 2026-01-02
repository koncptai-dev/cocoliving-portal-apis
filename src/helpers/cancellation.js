const moment = require('moment');

exports.getCancellationMeta = (booking) => {
  const today = moment().startOf('day');
  const checkIn = moment(booking.checkInDate);
  const checkOut = moment(booking.checkOutDate);

  const isActive =
    checkIn.isSameOrBefore(today) &&
    checkOut.isAfter(today);

  let effectiveCheckOutDate;

  if (isActive) {
    effectiveCheckOutDate = moment().endOf('month').format('YYYY-MM-DD');
  } else {
    effectiveCheckOutDate = booking.checkInDate;
  }

  return {
    isActive,
    effectiveCheckOutDate,
  };
};