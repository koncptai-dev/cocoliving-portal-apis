const cron = require('node-cron');
const moment = require('moment');
const { Booking } = require('../models/bookRoom'); 
const { User } = require('../models/user');
const { sendEmail } = require('./sendEmail'); 

cron.schedule('0 10 8 * *', async () => {
    console.log('--- 🗓️ Starting Monthly Rent Due Check for Admin ---');

    try {
        const bookings = await Booking.findAll({
            include: [{
                model: User,
                attributes: ['fullName', 'email', 'phone']
            }]
        });

        const today = moment();
        let overdueUsers = [];

        for (const booking of bookings) {
            const checkIn = moment(booking.checkInDate);
            
            const expectedInstallments = today.diff(checkIn, 'months') + 1;

            if (expectedInstallments > booking.installmentsPaid) {
                overdueUsers.push({
                    name: booking.User?.fullName || 'N/A',
                    email: booking.User?.email || 'N/A',
                    phone: booking.User?.phone || 'N/A',
                    paid: booking.installmentsPaid,
                    expected: expectedInstallments,
                    monthlyRent: booking.monthlyRent
                });
            }
        }

        if (overdueUsers.length > 0) {
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

            const htmlContent = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #e67e22;">Rent Due Report - ${today.format('MMMM YYYY')}</h2>
                    <p>The following users have unpaid installments as of the 8th of this month:</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                        <thead>
                            <tr style="background-color: #f8f9fa; text-align: left;">
                                <th style="border: 1px solid #ddd; padding: 8px;">User Name</th>
                                <th style="border: 1px solid #ddd; padding: 8px;">Email</th>
                                <th style="border: 1px solid #ddd; padding: 8px;">Phone</th>
                                <th style="border: 1px solid #ddd; padding: 8px;">Installments (Paid/Total)</th>
                                <th style="border: 1px solid #ddd; padding: 8px;">Rent/Month</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">Generated automatically by Coco Living System.</p>
                </div>
            `;

            await sendEmail({
                to: adminEmail,
                subject: `Rent Due Report - ${today.format('MMMM YYYY')}`,
                html: htmlContent
            });

            console.log(`Admin report sent successfully with ${overdueUsers.length} entries.`);
        } else {
            console.log('No overdue payments found today. No email sent.');
        }

    } catch (error) {
        console.error('Error in Rent Due Cron Job:', error);
    }
});