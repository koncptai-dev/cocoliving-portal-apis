const cron = require('node-cron');
const moment = require('moment');
const Booking = require('../models/bookRoom');
const User = require('../models/user');
const { sendEmail } = require('./sendEmail');
const { rentDueAdminEmail } = require('./emailTemplates/emailTemplates');

async function runRentDetailsReport() {
  console.log('--- Starting Monthly Rent Due Check for Admin ---');

  try {
    const bookings = await Booking.findAll({
      include: [{
        model: User,
        as: 'user',
        attributes: ['fullName', 'email', 'phone']
      }]
    });

    const today = moment();
    const overdueUsers = [];

    for (const booking of bookings) {
      const checkIn = moment(booking.checkInDate);
      const expectedInstallments = today.diff(checkIn, 'months') + 1;

      if (expectedInstallments > booking.installmentsPaid) {
        overdueUsers.push({
          name: booking.user?.fullName || 'N/A',
          email: booking.user?.email || 'N/A',
          phone: booking.user?.phone || 'N/A',
          paid: booking.installmentsPaid,
          expected: expectedInstallments,
          monthlyRent: booking.monthlyRent
        });
      }
    }

    const adminEmail = 'info@cocoliving.in';

    const tableRows = overdueUsers.map(user => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${user.name}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${user.email}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${user.phone}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${user.paid} / ${user.expected}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">₹${user.monthlyRent}</td>
      </tr>
    `).join('');

    const template = rentDueAdminEmail({
      reportMonth: today.format('MMMM YYYY'),
      tableRows,
      hasOverdue: overdueUsers.length > 0
    });

    await sendEmail({
      to: adminEmail,
      subject: `Rent Due Report - ${today.format('MMMM YYYY')}`,
      html: template.html,
      attachments: template.attachments
    });

    if (overdueUsers.length > 0) {
      console.log(`Admin report sent successfully with ${overdueUsers.length} entries.`);
    } else {
      console.log('No overdue payments found today. Admin email sent with empty report.');
    }
  } catch (error) {
    console.error('Error in Rent Due Cron Job:', error);
  }
}

function scheduleRentDetailsCron() {
  cron.schedule('0 10 8 * *', runRentDetailsReport);
}

scheduleRentDetailsCron();

module.exports = { runRentDetailsReport, scheduleRentDetailsCron };
