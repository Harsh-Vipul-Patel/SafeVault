const PDFDocument = require('pdfkit');

/**
 * Generates a Bank Statement PDF
 * @param {Object} accountInfo - Contains account_number, customer_name, etc.
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<Buffer>} - Resolves with the PDF Buffer
 */
const generateStatementPDF = (accountInfo, transactions) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // Header
            doc.fontSize(20).text('Suraksha Bank Account Statement', { align: 'center' });
            doc.moveDown();

            // Account Info
            doc.fontSize(12).text(`Customer Name: ${accountInfo.full_name || accountInfo.CUSTOMER_NAME}`);
            doc.text(`Account Number: ${accountInfo.account_number || accountInfo.ACCOUNT_NUMBER}`);
            doc.text(`Statement Generated: ${new Date().toLocaleString('en-IN')}`);
            doc.moveDown(2);

            // Transactions Table Header
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Date', 50, tableTop);
            doc.text('Description', 150, tableTop);
            doc.text('Amount', 350, tableTop, { width: 90, align: 'right' });
            doc.text('Balance', 450, tableTop, { width: 90, align: 'right' });

            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
            doc.font('Helvetica');

            let yPosition = tableTop + 25;

            // Transactions Row
            transactions.forEach(t => {
                const dateStr = new Date(t.TRANSACTION_DATE || t.transaction_date).toLocaleDateString('en-IN');
                const desc = t.DESCRIPTION || t.description || '—';
                const type = (t.TRANSACTION_TYPE || t.transaction_type || '').toUpperCase();
                const amtRaw = Number(t.AMOUNT || t.amount || 0);
                const isCredit = type.includes('CREDIT') || type.includes('DEPOSIT');

                const amtStr = (isCredit ? '+' : '-') + ' Rs.' + amtRaw.toFixed(2);
                const balStr = 'Rs.' + Number(t.BALANCE_AFTER || t.balance_after).toFixed(2);

                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }

                doc.text(dateStr, 50, yPosition);
                doc.text(desc, 150, yPosition, { width: 190 });
                doc.text(amtStr, 350, yPosition, { width: 90, align: 'right' });
                doc.text(balStr, 450, yPosition, { width: 90, align: 'right' });

                doc.moveTo(50, yPosition + 15).lineTo(550, yPosition + 15).strokeColor('#cccccc').stroke();

                const descLines = Math.ceil(desc.length / 32);
                yPosition += 15 + (descLines * 10);
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Generates a high-end Glassmorphism Transaction Receipt PDF
 * @param {Object} data - Contains txn_id, ref, date, sender, receiver, type, amount, balance, isReceiver
 * @returns {Promise<Buffer>}
 */
const generateTransactionReceiptPDF = (data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const isReceiver = data.isReceiver || false;
            const colors = {
                navy: '#0D1B2A',
                navyCard: '#162032',
                gold: '#C9962A',
                gold2: '#E8B84B',
                cream: '#F5F0E8',
                cream2: '#EDE7D9',
                muted: '#6B7E95',
                success: '#3DD68C',
                danger: '#FF8080'
            };

            // Background
            doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.navy);

            // Card dimensions
            const cardX = 50;
            const cardY = 50;
            const cardW = doc.page.width - cardX * 2;
            const cardH = doc.page.height - cardY * 2;

            // Watermark (background level)
            doc.save();
            doc.opacity(0.04)
                .font('Helvetica-Bold')
                .fontSize(70)
                .fillColor(colors.gold);
            doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
            doc.text('SAFE VAULT', 0, doc.page.height / 2 - 35, { align: 'center', width: doc.page.width });
            doc.restore();

            // Main Card
            doc.roundedRect(cardX, cardY, cardW, cardH, 8)
                .fill(colors.navyCard);

            // Top Gold Border (Fixed Gradient)
            const topGrad = doc.linearGradient(cardX, cardY, cardX + cardW, cardY);
            // safe values for stop()
            topGrad.stop(0, colors.gold2, 0);
            topGrad.stop(0.5, colors.gold2, 1);
            topGrad.stop(1, colors.gold2, 0);
            doc.rect(cardX, cardY, cardW, 3).fill(topGrad);

            let y = cardY + 40;

            // Header
            doc.font('Helvetica-Bold').fontSize(26).fillColor(colors.cream)
                .text('SURAKSHA BANK', cardX, y, { align: 'center', width: cardW });
            y += 32;
            doc.font('Helvetica').fontSize(10).fillColor(colors.gold2)
                .text('PREMIUM SECURE VAULT SYSTEM TRANSACTION RECEIPT', cardX, y, { align: 'center', width: cardW, characterSpacing: 1 });
            y += 50;

            // Amount Section
            const typeLabel = (data.type || (isReceiver ? 'Transfer In' : 'Transfer Out')).toUpperCase();
            const statusCol = isReceiver ? colors.success : colors.cream;
            doc.font('Helvetica-Bold').fontSize(12).fillColor(statusCol)
                .text(typeLabel, cardX + 30, y);
            y += 20;

            // Source Tag
            const source = (data.source || 'INTERNAL').toLowerCase();
            const srcClasses = {
                teller: { label: 'TELLER', color: '#7EB2FF', bg: '#1A2B3D' },
                internal: { label: 'INTERNAL', color: '#3DD68C', bg: '#162A22' },
                netbanking: { label: 'NET BANKING', color: '#E8B84B', bg: '#252016' },
                atm: { label: 'ATM', color: '#C97BFF', bg: '#20162A' },
                pos: { label: 'POS', color: '#FFC04D', bg: '#2A2016' },
                loan: { label: 'LOAN', color: '#3DB88A', bg: '#162A20' },
                external: { label: 'EXTERNAL', color: '#FFA060', bg: '#2A1D16' }
            };
            const sc = srcClasses[source] || srcClasses.internal;

            doc.save();
            const tagText = `⬤ ${sc.label}`;
            const tagW = doc.widthOfString(tagText, { size: 9 }) + 20;
            doc.roundedRect(cardX + 30, y, tagW, 18, 4).fill(sc.bg);
            doc.fillColor(sc.color).fontSize(9).text(tagText, cardX + 40, y + 4);
            doc.restore();
            y += 35;

            // Large Amount
            const amtStr = `${isReceiver ? '+ ' : ''}Rs. ${Number(data.amount).toLocaleString('en-IN')}`;
            doc.font('Helvetica-Bold').fontSize(38).fillColor(isReceiver ? colors.success : colors.cream)
                .text(amtStr, cardX + 30, y);
            y += 60;

            // Tables Helper
            const drawTable = (rows) => {
                const tableW = cardW - 60;
                doc.save();
                doc.rect(cardX + 30, y, tableW, rows.length * 24 + 10)
                    .fillOpacity(0.3).fill(colors.navy).fillOpacity(1)
                    .strokeColor('rgba(255,255,255,0.05)').lineWidth(0.5).stroke();

                rows.forEach((row, idx) => {
                    const rowY = y + 10 + (idx * 24);
                    doc.fontSize(10).fillColor(colors.muted).text(row.label, cardX + 45, rowY);
                    doc.fillColor(row.highlight ? colors.gold2 : colors.cream2)
                        .font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
                        .text(row.value, cardX + 45, rowY, { align: 'right', width: tableW - 30 });

                    if (idx < rows.length - 1) {
                        doc.moveTo(cardX + 40, rowY + 16).lineTo(cardX + cardW - 40, rowY + 16)
                            .strokeColor('rgba(255,255,255,0.03)').stroke();
                    }
                });
                doc.restore();
                y += rows.length * 24 + 25;
            };

            // Table 1
            drawTable([
                { label: 'TRANSACTION REF', value: data.ref || 'TXN-' + Date.now().toString().slice(-8) },
                { label: 'PROCEDURE CALLED', value: data.procedure || 'sp_internal_transfer()' },
                { label: 'DATE & TIME', value: new Date(data.date || Date.now()).toLocaleString('en-IN') }
            ]);

            // Table 2
            drawTable([
                { label: 'FROM ACCOUNT', value: data.sender || '---' },
                { label: 'TO ACCOUNT', value: data.receiver || '---' },
                ...(data.isolation ? [{ label: 'ISOLATION LEVEL', value: data.isolation }] : [])
            ]);

            // Table 3
            drawTable([
                { label: 'SESSION AUTH', value: data.auth || 'OTP VERIFIED (Customer Session)' },
                { label: 'UPDATED BALANCE', value: `Rs. ${Number(data.balance).toLocaleString('en-IN')}`, highlight: true }
            ]);

            // Scope Note
            if (data.scopeNote) {
                doc.fontSize(8.5).fillColor('rgba(107,126,149,0.7)')
                    .text(data.scopeNote, cardX + 30, y, { width: cardW - 60, lineGap: 2 });
                y += 25;
            }

            // Footer
            const footerY = cardY + cardH - 100;
            doc.fontSize(10).fillColor(colors.muted)
                .text('Certified and encrypted by Suraksha Bank Core Security Lab', 0, footerY, { align: 'center', width: doc.page.width });
            doc.text('Authorized for digital records only.', { align: 'center' });
            y = footerY + 35;

            doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.gold2)
                .text('Thank You For Your Loyalty', 0, y, { align: 'center', width: doc.page.width });
            y += 20;

            doc.fontSize(8).fillColor(colors.muted)
                .text('SURAKSHA BANK | SAFE VAULT | ALL RIGHTS RESERVED', 0, y, { align: 'center', width: doc.page.width, characterSpacing: 1.5 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};


module.exports = {
    generateStatementPDF,
    generateTransactionReceiptPDF
};
