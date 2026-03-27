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
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notif_id = :nid`,
                { nid: notifId }
            );
        } else {
            await connection.execute(
                `UPDATE NOTIFICATION_LOG SET status = 'SENT', resend_message_id = :msgId WHERE notif_id = :nid`,
                { msgId: data.id, nid: notifId }
            );
        }
        await connection.commit();

    } catch (err) {
        console.error(`Internal Dispatch Error for notif ${notifId}:`, err);
        try {
            await connection.execute(
                `UPDATE NOTIFICATION_LOG SET status = 'FAILED' WHERE notif_id = :nid`,
                { nid: notifId }
            );
            await connection.commit();
        } catch (dbErr) {
            console.error('Final DB Error in dispatchEmail:', dbErr);
        }
    }
}

/**
 * Polls and processes pending notifications for a specific user/customer
 * FIX: Use named bind variable :bindId instead of positional [id]
 * to avoid ORA-01745 when id contains hyphens (e.g., CUST-MUM-001)
 */
async function processPendingNotifications(id, connection, isUserId = true) {
    // Use RAWTOHEX for user_id (RAW type), direct compare for customer_id (VARCHAR2)
    const whereClause = isUserId
        ? `RAWTOHEX(n.user_id) = :bindId`
        : `n.customer_id = :bindId`;

    const result = await connection.execute(
        `SELECT n.notif_id, n.trigger_event, n.message_clob, c.email
         FROM NOTIFICATION_LOG n
         JOIN CUSTOMERS c ON n.customer_id = c.customer_id
         WHERE ${whereClause} AND n.status = 'PENDING'`,
        { bindId: id },
        {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchInfo: { "MESSAGE_CLOB": { type: oracledb.STRING } }
        }
    );

    for (const row of result.rows) {
        const { NOTIF_ID, TRIGGER_EVENT, MESSAGE_CLOB, EMAIL } = row;
        await dispatchEmail(NOTIF_ID, TRIGGER_EVENT, MESSAGE_CLOB, EMAIL, connection)
            .catch(e => console.error(`Dispatch failed for notif ${NOTIF_ID}:`, e));

        // Respect Resend rate limits (2/sec)
        await new Promise(resolve => setTimeout(resolve, 550));
    }
}

module.exports = { dispatchEmail, processPendingNotifications };
