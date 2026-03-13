const { generateTransactionReceiptHTML } = require('./backend/utils/pdfGenerator');
const fs = require('fs');

const mockData = {
    ref: 'TXN-08212873',
    date: new Date('2026-03-08T12:00:00Z'),
    sender: 'Ravi Verma',
    receiver: 'Anjali Desai',
    type: 'transfer_out',
    status: 'Payment Successful',
    amount: 8500,
    balance: 11101950,
    procedure: 'sp_internal_transfer()',
    auth: 'OTP VERIFIED (Customer Session)',
    dir: 'DR'
};

const html = generateTransactionReceiptHTML(mockData);
fs.writeFileSync('debug_receipt.html', `
<!DOCTYPE html>
<html>
<head>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { background: #0D1B2A; margin: 0; padding: 20px; }
    </style>
</head>
<body>
    ${html}
</body>
</html>
`);
console.log('debug_receipt.html generated');
