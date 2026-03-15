const { getTransactionEmail, getExternalTxnInitiatedEmail } = require('./services/emailService');

const html1 = getTransactionEmail({
    customer_name: 'John Doe',
    txn_type: 'DEBIT',
    amount: 5000,
    balance_after: 15000,
    txn_id: 'TRF-1234',
    txn_timestamp: '2026-03-15T12:00:00Z',
    account_number: '12345678901234',
    method: 'Internal Transfer to 98765432109876'
});

console.log('--- TXN ALERT TEST ---');
console.log(html1.includes('Internal Transfer to 98765432109876') ? '✅ Method included correctly' : '❌ Method missing from HTML');
console.log(html1.includes('>Method<') ? '✅ Method Header included correctly' : '❌ Method Header missing from HTML');

const html2 = getExternalTxnInitiatedEmail({
    customer_name: 'Jane Doe',
    amount: 10000,
    dest_acc: '123456789',
    mode: 'NEFT',
    method: 'NEFT Transfer',
    status: 'PENDING'
});

console.log('--- EXT TXN INITIATED ALERT TEST ---');
console.log(html2.includes('NEFT Transfer') ? '✅ Method included correctly' : '❌ Method missing from HTML');

