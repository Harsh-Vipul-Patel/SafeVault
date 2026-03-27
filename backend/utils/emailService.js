const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend with the API key from .env
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} content - Email body content
 * @param {Array} attachments - Optional array of attachment objects
 * @returns {Promise<any>}
 */
const sendEmail = async (to, subject, content, attachments = [], isHtml = false) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.error('RESEND_API_KEY is not set in .env');
            throw new Error('Missing Resend API Key');
        }

        const mailOptions = {
            from: process.env.RESEND_FROM_EMAIL || 'Suraksha Bank <onboarding@resend.dev>',
            to,
            subject,
            [isHtml ? 'html' : 'text']: content,
            attachments: attachments.map(att => ({
                ...att,
                content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content
            }))
        };

        const info = await resend.emails.send(mailOptions);

        if (info.error) {
            console.error('RESEND API Error:', info.error.message || 'Validation Error');
            
            // --- DEVELOPMENT FALLBACK: MOCK EMAIL ---
            console.log('\n======================================================');
            console.log(' 🛠️ OFFLINE TESTING / MOCK EMAIL DELIVERY');
            console.log(' external email API is unactivated/blocked!');
            console.log(` 📧 To: ${to}`);
            console.log(` 📝 Subject: ${subject}`);
            console.log('------------------------------------------------------');
            console.log(isHtml ? content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n').trim() : content);
            console.log('======================================================\n');
            
            return { messageId: 'simulated-tx', status: 'MOCKED' };
        }

        console.log('--- Email Status ---');
        console.log('Message sent:', info.id || info.data?.id || 'Success');
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
