const brandedTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; }
    .container { max-width: 600px; margin: 0 auto; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { font-size: 24px; font-weight: 700; color: #38bdf8; margin-bottom: 24px; text-align: center; }
    .content { font-size: 16px; line-height: 1.6; margin-bottom: 32px; color: #cbd5e1; }
    .footer { font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px; }
    .btn { display: inline-block; padding: 12px 24px; background: #38bdf8; color: #0f172a; text-decoration: none; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Suraksha Bank</div>
    <div class="content">
      <h2 style="color: #f8fafc;">${title}</h2>
      ${content}
    </div>
    <div class="footer">
      This is an automated notification. Please do not reply to this email.<br>
      &copy; 2026 Suraksha Bank. Secure. Reliable. Trusted.
    </div>
  </div>
</body>
</html>
`;

module.exports = {
    getTransactionEmail: (data) => brandedTemplate(
        'Transaction Alert',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>A ${data.txn_type} transaction occurred on your account <strong>${data.account_number}</strong>.</p>
     <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px;">
       <p>Amount: <span style="color: #38bdf8; font-size: 20px;">₹${data.amount}</span></p>
       <p>Transaction ID: ${data.txn_id}</p>
       <p>Timestamp: ${data.txn_timestamp}</p>
       <p>Balance After: ₹${data.balance_after}</p>
     </div>
     <p>If you did not authorize this transaction, please contact us immediately.</p>`
    ),

    getBeneAddedEmail: (data) => brandedTemplate(
        'Beneficiary Added',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>A new beneficiary has been added to your profile:</p>
     <ul>
       <li>Name: ${data.beneficiary_name}</li>
       <li>Account: ${data.account_number}</li>
       <li>IFSC: ${data.ifsc_code}</li>
     </ul>
     <p><strong>Security Notice:</strong> This beneficiary will be active after a cooling period of ${data.activation_time}.</p>`
    ),

    getBeneActiveEmail: (data) => brandedTemplate(
        'Beneficiary Activated',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>Your beneficiary <strong>${data.beneficiary_name}</strong> is now ACTIVE and ready for transfers.</p>`
    ),

    getSIExecutedEmail: (data) => brandedTemplate(
        'Standing Instruction Executed',
        `<p>Dear ${data.customer_name},</p>
     <p>Your standing instruction (ID: ${data.instruction_id}) was successfully executed.</p>
     <p>Amount: ₹${data.amount}</p>
     <p>Transaction ID: ${data.txn_id}</p>
     <p>Next Execution: ${data.next_execution}</p>`
    ),

    getSIFailedEmail: (data) => brandedTemplate(
        'Standing Instruction Failed',
        `<p>Dear ${data.customer_name},</p>
     <p>Your standing instruction (ID: ${data.instruction_id}) FAILED to execute.</p>
     <p>Reason: <span style="color: #ef4444;">${data.error}</span></p>
     <p>Please ensure sufficient funds are available in your account.</p>`
    ),

    getSRCreatedEmail: (data) => brandedTemplate(
        'Service Request Received',
        `<p>Dear ${data.customer_name},</p>
     <p>We have received your service request for <strong>${data.request_type}</strong>.</p>
     <blockquote style="border-left: 4px solid #38bdf8; padding-left: 16px; color: #94a3b8;">
       ${data.description}
     </blockquote>
     <p>Our team will review it shortly. Tracking ID: #${data.sr_id || 'PENDING'}</p>`
    ),

    getSRResolvedEmail: (data) => brandedTemplate(
        'Service Request Resolved',
        `<p>Dear ${data.customer_name},</p>
     <p>Your service request <strong>${data.request_type}</strong> has been marked as <strong>${data.status}</strong>.</p>
     <p>Resolution Details: ${data.resolution_notes}</p>`
    ),

    getKYCVerifiedEmail: (data) => brandedTemplate(
        'KYC Verified',
        `<p>Dear ${data.customer_name},</p>
     <p>Your KYC document (<strong>${data.document_type}</strong>) has been successfully verified.</p>
     <p>Status: <span style="color: #22c55e;">VERIFIED</span></p>
     <p>Expiry: ${data.expiry_date}</p>`
    ),

    getKYCExpirySoonEmail: (data) => brandedTemplate(
        'KYC Expiring Soon',
        `<p>Dear ${data.customer_name},</p>
     <p>Your KYC document <strong>${data.document_type}</strong> is set to expire in ${data.days_left} days.</p>
     <p>Please update your KYC details to avoid any service interruptions.</p>`
    ),

    getFDOpenedEmail: (data) => brandedTemplate(
        'Fixed Deposit Created',
        `<p>Dear ${data.customer_name},</p>
     <p>A new Fixed Deposit (ID: ${data.fd_id}) has been opened.</p>
     <ul>
       <li>Principal: ₹${data.amount}</li>
       <li>Tenure: ${data.tenure} months</li>
       <li>Interest Rate: ${data.rate}%</li>
       <li>Maturity Date: ${data.maturity_date}</li>
     </ul>`
    ),

    getFDMaturedEmail: (data) => brandedTemplate(
        'Fixed Deposit Matured',
        `<p>Dear ${data.customer_name},</p>
     <p>Your Fixed Deposit (ID: ${data.fd_id}) has matured.</p>
     <p>Maturity Amount: ₹${data.maturity_amount}</p>
     <p>Auto-Renewal: ${data.auto_renewed === 'Y' ? 'YES' : 'NO'}</p>`
    ),

    getFDClosedEmail: (data) => brandedTemplate(
        'Fixed Deposit Closed',
        `<p>Dear ${data.customer_name},</p>
     <p>Your Fixed Deposit (ID: ${data.fd_id}) has been closed.</p>
     <p>Payout Amount: ₹${data.payout_amount}</p>
     <p>Funds have been credited to your linked accounts.</p>`
    ),

    getLoanDisbursedEmail: (data) => brandedTemplate(
        'Loan Disbursed',
        `<p>Dear ${data.customer_name},</p>
     <p>Congratulations! Your loan has been disbursed.</p>
     <p>Loan Account: ${data.loan_account_id}</p>
     <p>Disbursed Amount: ₹${data.amount}</p>
     <p>Funds have been credited to your linked accounts.</p>`
    ),

    getEMIPaidEmail: (data) => brandedTemplate(
        'EMI Payment Successful',
        `<p>Dear ${data.customer_name},</p>
     <p>Your EMI payment for Loan ${data.loan_account_id} was successful.</p>
     <p>Amount: ₹${data.emi_amount}</p>
     ${data.penalty > 0 ? `<p>Penalty Paid: ₹${data.penalty}</p>` : ''}`
    )
};
