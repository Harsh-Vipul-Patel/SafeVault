const brandedTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
    body { 
        font-family: 'DM Sans', system-ui, sans-serif; 
        background-color: #0D1B2A; 
        color: #F5F0E8; 
        padding: 40px; 
        margin: 0;
    }
    .container { 
        max-width: 600px; 
        margin: 0 auto; 
        background: linear-gradient(160deg, #162032 0%, #0A1520 100%); 
        border: 1px solid rgba(201, 150, 42, 0.2); 
        border-radius: 16px; 
        padding: 40px; 
        box-shadow: 0 24px 60px rgba(0,0,0,0.6); 
    }
    .header { 
        font-family: 'Cormorant Garamond', serif;
        font-size: 28px; 
        font-weight: 700; 
        color: #C9962A; 
        margin-bottom: 32px; 
        text-align: center; 
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .content { 
        font-size: 16px; 
        line-height: 1.8; 
        margin-bottom: 40px; 
        color: #EDE7D9; 
    }
    .footer { 
        font-size: 12px; 
        color: #6B7E95; 
        text-align: center; 
        border-top: 1px solid rgba(255, 255, 255, 0.05); 
        padding-top: 32px; 
        font-family: 'JetBrains Mono', monospace;
    }
    .btn { 
        display: inline-block; 
        padding: 14px 28px; 
        background: linear-gradient(135deg, #C9962A 0%, #E8B84B 100%); 
        color: #0D1B2A !important; 
        text-decoration: none; 
        border-radius: 8px; 
        font-weight: 700; 
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
    }
    .data-table {
        width: 100%;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 20px;
        margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Suraksha Bank</div>
    <div class="content">
      <h2 style="color: #F5F0E8; font-family: 'Cormorant Garamond', serif; font-size: 24px; margin-top: 0;">${title}</h2>
      ${content}
    </div>
    <div class="footer">
      This is a secure automated notification from our Core Defense System.<br>
      &copy; 2026 Suraksha Bank. Secure · Reliable · Trusted.
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
     <div class="data-table">
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Amount</span>
         <span style="color: #3DD68C; font-size: 20px; font-weight: 600;">₹${data.amount}</span>
       </div>
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Reference</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.txn_id}</span>
       </div>
       ${data.method ? `
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Method</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.method}</span>
       </div>` : ''}
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Timestamp</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.txn_timestamp}</span>
       </div>
       <div style="display: flex; justify-content: space-between;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Settled Balance</span>
         <span style="color: #C9962A; font-weight: 600;">₹${data.balance_after}</span>
       </div>
     </div>
     <p>If you did not authorize this transaction, please contact our security team immediately.</p>`
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

    getRDOpenedEmail: (data) => brandedTemplate(
        'Recurring Deposit Created',
        `<p>Dear ${data.customer_name},</p>
     <p>A new Recurring Deposit (ID: ${data.rd_id}) has been successfully opened.</p>
     <ul>
       <li>Monthly Instalment: ₹${data.amount}</li>
       <li>Tenure: ${data.tenure} months</li>
       <li>Interest Rate: ${data.rate}%</li>
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
    ),

    getChequeBookIssuedEmail: (data) => brandedTemplate(
        'Cheque Book Issued',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>A new cheque book has been issued for your account <strong>${data.account_id}</strong>.</p>
     <div class="data-table">
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Range</span>
         <span style="color: #C9962A; font-weight: 600;">${data.start_num} - ${data.end_num}</span>
       </div>
       <div style="display: flex; justify-content: space-between;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Leaves</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.leaves} Leaves</span>
       </div>
     </div>
     <p>Please ensure you store your cheque book securely. Our logistics partner will deliver it to your registered address within 3-5 business days.</p>`
    ),

    getExternalTxnInitiatedEmail: (data) => brandedTemplate(
        'External Transfer Initiated',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>An external transfer of <span style="color: #C9962A; font-size: 20px; font-weight: 600;">₹${Number(data.amount).toLocaleString('en-IN')}</span> has been initiated from your account.</p>
     <div class="data-table">
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Destination</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.dest_acc}</span>
       </div>
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Mode</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.method || data.mode || 'NEFT/IMPS'}</span>
       </div>
       <div style="display: flex; justify-content: space-between;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Status</span>
         <span style="color: #C9962A; font-weight: 600;">${data.status || 'PENDING APPROVAL'}</span>
       </div>
     </div>
     <p style="font-size: 14px; color: #6B7E95; font-style: italic;">Note: This transaction has been sent to the manager and is waiting for approval.</p>
     <p>If you did not initiate this, please contact our Security Operations Center immediately.</p>`
    ),

    getExternalTxnApprovedEmail: (data) => brandedTemplate(
        'External Transfer Approved',
        `<p>Dear <strong>${data.customer_name}</strong>,</p>
     <p>Your external transfer of <span style="color: #3DD68C; font-size: 20px; font-weight: 600;">₹${Number(data.amount).toLocaleString('en-IN')}</span> has been <strong>APPROVED</strong> and sent for settlement.</p>
     <div class="data-table">
       <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Reference (UTR)</span>
         <span style="color: #C9962A; font-weight: 600;">${data.utr}</span>
       </div>
       <div style="display: flex; justify-content: space-between;">
         <span style="color: #6B7E95; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase;">Destination</span>
         <span style="color: #F5F0E8; font-weight: 500;">${data.dest_acc}</span>
       </div>
     </div>
     <p>The funds should reach the destination account as per standard RBI clearing cycles. Thank you for using Safe Vault.</p>`
    )
};
