const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend with the API key from .env
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Email body text
 * @param {Array} attachments - Optional array of attachment objects
 * @returns {Promise<any>}
 */
const sendEmail = async (to, subject, text, attachments = []) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.error('RESEND_API_KEY is not set in .env');
            throw new Error('Missing Resend API Key');
        }

        const mailOptions = {
            from: process.env.RESEND_FROM_EMAIL || 'Suraksha Bank <onboarding@resend.dev>',
            to,
            subject,
            text,
            attachments: attachments.map(att => ({
                ...att,
                content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content
            }))
        };

        const info = await resend.emails.send(mailOptions);

        console.log('--- Email Status ---');
        console.log('Message sent:', info.id);
        console.log('--------------------');

        return info;
    } catch (error) {
        console.error('Error sending email via Resend:', error);
        throw error;
    }
};

module.exports = {
    sendEmail
};
