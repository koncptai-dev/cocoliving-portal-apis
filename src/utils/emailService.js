const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

//forgot password
exports.sendResetEmail = async (email, code) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Password Reset Code',
            text: `Your password reset code is ${code}`,
        })
        console.log('Reset email sent:', info.response);
        
    } catch (error) {
        console.log('Error sending reset email:', error);
        throw error;
    }
}

