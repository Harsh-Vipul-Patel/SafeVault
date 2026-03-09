const { generateTransactionReceiptPDF } = require('./backend/utils/pdfGenerator');
const fs = require('fs');

async function testPdfInIsolation() {
    const mockData = {
        ref: 'TXN-TEST-123',
        date: new Date(),
        sender: 'Test Sender',
        receiver: 'Test Receiver',
        type: 'Internal Transfer Out',
        source: 'internal',
        procedure: 'sp_internal_transfer()',
        amount: 5000,
        balance: 100000,
        isReceiver: false,
        isolation: 'SERIALIZABLE + FOR UPDATE',
        scopeNote: '✓ IN SCOPE — Handled by sp_internal_transfer() · TRANSACTIONS table · type = TRANSFER_DEBIT'
    };

    try {
        console.log('Generating PDF...');
        const buffer = await generateTransactionReceiptPDF(mockData);
        fs.writeFileSync('test_receipt.pdf', buffer);
        console.log('✅ Success: PDF generated without errors. check test_receipt.pdf if needed.');
    } catch (err) {
        console.error('❌ PDF Generation Failed:', err);
    }
}

testPdfInIsolation();
