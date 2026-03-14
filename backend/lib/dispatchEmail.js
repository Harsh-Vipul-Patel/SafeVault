const { resend } = require('./mailer');
const emailService = require('../services/emailService');
const { query } = require('../db');

const templateMap = {
    'TXN_ALERT': emailService.getTransactionEmail,
    'BENE_ADDED': emailService.getBeneAddedEmail,
    'BENE_ACTIVE': emailService.getBeneActiveEmail,
    'SI_EXECUTED': emailService.getSIExecutedEmail,
    'SI_FAILED': emailService.getSIFailedEmail,
    'SR_CREATED': emailService.getSRCreatedEmail,
    'SR_RESOLVED': emailService.getSRResolvedEmail,
    'KYC_VERIFIED': emailService.getKYCVerifiedEmail,
    'KYC_EXPIRY_SOON': emailService.getKYCExpirySoonEmail,
    'FD_OPENED': emailService.getFDOpenedEmail,
    'RD_OPENED': emailService.getRDOpenedEmail,
    'FD_MATURED': emailService.getFDMaturedEmail,
    'FD_CLOSED': emailService.getFDClosedEmail,
    'LOAN_DISBURSED': emailService.getLoanDisbursedEmail,
    'EMI_PAID': emailService.getEMIPaidEmail,
};

async function dispatchEmail(notifId, triggerEvent, payloadJson, customerEmail) {
    try {
        const payload = JSON.parse(payloadJson);
        const getTemplate = templateMap[triggerEvent];

        if (!getTemplate) {
            console.warn(`No template found for trigger: ${triggerEvent}`);
            return;
        }

        const html = getTemplate(payload);
        const subject = `Suraksha Bank: ${triggerEvent.replace(/_/g, ' ')}`;

        const { data, error } = await resend.emails.send({
            from: process.env.MAIL_FROM || 'Suraksha Bank <notifications@resend.dev>',
            to: customerEmail,
            subject: subject,
            html: html,
            reply_to: process.env.MAIL_REPLY_TO
        });

        if (error) {
            console.error(`Resend Error for notif ${notifId}:`, error);
            await query(
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notification_id = $1`,
                [notifId]
            );
        } else {
            await query(
                `UPDATE NOTIFICATION_LOG SET status = 'SENT', resend_message_id = $1 WHERE notification_id = $2`,
                [data.id, notifId]
            );
        }

    } catch (err) {
        console.error(`Internal Dispatch Error for notif ${notifId}:`, err);
        try {
            await query(
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notification_id = $1`,
                [notifId]
            );
        } catch (dbErr) {
            console.error('Final DB Error in dispatchEmail:', dbErr);
        }
    }
}

/**
 * Polls and processes pending notifications for a specific user
 */
async function processPendingNotifications(userId) {
    try {
        const result = await query(
            `SELECT n.notification_id, n.trigger_event, n.message_clob, c.email
             FROM NOTIFICATION_LOG n
             JOIN CUSTOMERS c ON n.customer_id = c.customer_id
             WHERE (n.user_id = $1 OR c.customer_id = $1) AND n.status = 'QUEUED'`,
            [userId]
        );

        for (const row of result.rows) {
            const { notification_id, trigger_event, message_clob, email } = row;
            // Non-blocking dispatch
            dispatchEmail(notification_id, trigger_event, message_clob, email);
        }
    } catch (err) {
        console.error('processPendingNotifications error:', err);
    }
}

module.exports = { dispatchEmail, processPendingNotifications };
