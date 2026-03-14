const { resend } = require('./mailer');
const emailService = require('../services/emailService');
const oracledb = require('oracledb');

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
    'CHQ_BOOK_ISSUED': emailService.getChequeBookIssuedEmail,
    'EXT_TXN_INITIATED': emailService.getExternalTxnInitiatedEmail,
    'EXT_TXN_APPROVED': emailService.getExternalTxnApprovedEmail,
};

async function dispatchEmail(notifId, triggerEvent, payloadJson, customerEmail, connection) {
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
            await connection.execute(
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notif_id = :id`,
                [notifId]
            );
        } else {
            await connection.execute(
                `UPDATE NOTIFICATION_LOG SET status = 'SENT', resend_message_id = :msgId WHERE notif_id = :id`,
                [data.id, notifId]
            );
        }
        await connection.commit();

    } catch (err) {
        console.error(`Internal Dispatch Error for notif ${notifId}:`, err);
        try {
            await connection.execute(
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notif_id = :id`,
                [notifId]
            );
            await connection.commit();
        } catch (dbErr) {
            console.error('Final DB Error in dispatchEmail:', dbErr);
        }
    }
}

/**
 * Polls and processes pending notifications for a specific user
 */
async function processPendingNotifications(id, connection, isUserId = true) {
    const whereClause = isUserId ? `n.user_id = :id` : `n.customer_id = :id`;
    const result = await connection.execute(
        `SELECT n.notif_id, n.trigger_event, n.message_clob, c.email
     FROM NOTIFICATION_LOG n
     JOIN CUSTOMERS c ON n.customer_id = c.customer_id
     WHERE ${whereClause} AND n.status = 'PENDING'`,
        [id],
        { 
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchInfo: { "MESSAGE_CLOB": { type: oracledb.STRING } } 
        }
    );

    for (const row of result.rows) {
        const { NOTIF_ID, TRIGGER_EVENT, MESSAGE_CLOB, EMAIL } = row;
        // Block and wait for dispatch to avoid rate limits and connection issues
        await dispatchEmail(NOTIF_ID, TRIGGER_EVENT, MESSAGE_CLOB, EMAIL, connection).catch(e => console.error(`Dispatch failed for notif ${NOTIF_ID}:`, e));
        
        // Small delay to respect Resend rate limits (2/sec)
        await new Promise(resolve => setTimeout(resolve, 550));
    }
}

module.exports = { dispatchEmail, processPendingNotifications };
