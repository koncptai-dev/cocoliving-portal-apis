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

//mail sender
const mailsender=async (email,title,body)=>{

    try{
        let transporter=nodemailer.createTransport({
            host:process.env.SMTP_HOST,
            port:465,
            secure:true,
            auth:{
                user:process.env.SMTP_USER,
                pass:process.env.SMTP_PASS
            }
        })
        let info=await transporter.sendMail({
            from:'COCO_LIVING',
            to:`${email}`,
            subject:`${title}`,
            html:`${body}`,
        })
        // console.log('information',info);
        return info;
    }
    catch(err){
        console.log("Email Sendin Failed:",err.message);
        throw err;
    }
}
module.exports={
    mailsender,
};