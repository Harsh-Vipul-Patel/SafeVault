const PDFDocument = require('pdfkit');
const tokens = require('./designTokens');

/**
 * Generates an Ultra-Premium High-Fidelity Transaction Receipt in HTML/CSS (v2 Vault Edition)
 * Based on suraksha_receipts_v2.jsx
 */
const generateTransactionReceiptHTML = (data) => {
    const { colors } = tokens;
    const type = (data.type || '').toLowerCase();
    const isCredit = (data.dir === 'CR') || type.includes('credit') || type.includes('deposit') || type.includes('received');
    const statusText = (data.status || (isCredit ? 'Payment Received' : 'Payment Successful')).toUpperCase();

    const borderColor = isCredit ? 'rgba(52,211,153,0.18)' : 'rgba(232,184,75,0.18)';
    const shadowColor = isCredit ? 'rgba(52,211,153,0.3)' : 'rgba(232,184,75,0.3)';
    const stampGlow = isCredit ? 'rgba(52,211,153,0.4)' : 'rgba(232,184,75,0.4)';

    return `
        <div style="max-width: 520px; margin: 40px auto; background: linear-gradient(160deg, ${colors.navyCard} 0%, ${colors.navyMid} 100%); overflow: hidden; border: 1px solid ${borderColor}; border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px ${borderColor}, 0 -1px 0 ${shadowColor}; position: relative; font-family: 'DM Sans', sans-serif; color: ${colors.cream};">
            <div style="height: 3px; background: linear-gradient(90deg, transparent 0%, ${isCredit ? colors.success : colors.gold2} 40%, ${isCredit ? colors.success : colors.gold2} 60%, transparent 100%);"></div>
            <div style="padding: 30px 24px 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <div style="display: inline-block; vertical-align: middle;">
                    <div style="display: inline-block; vertical-align: middle; width: 26px; height: 26px; background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.gold2} 100%); border-radius: 6px; line-height: 26px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: ${colors.navy}; margin-right: 10px; box-shadow: 0 2px 8px rgba(201,150,42,0.3);">SV</div>
                    <div style="display: inline-block; vertical-align: middle; text-align: left;">
                        <div style="font-family: 'Cormorant Garamond', serif; color: ${colors.cream}; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.06em; line-height: 1;">SURAKSHA BANK</div>
                    </div>
                </div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase; color: ${colors.gold2}; opacity: 0.7; margin-top: 8px;">SAFE VAULT · SECURE TRANSACTION RECEIPT</div>
            </div>
            <div style="text-align: center; padding: 30px 24px 25px; position: relative;">
                <div style="display: inline-block; padding: 5px 14px; border-radius: 20px; background: ${isCredit ? colors.success + '1a' : 'rgba(201,150,42,0.1)'}; border: 1px solid ${isCredit ? colors.success + '40' : 'rgba(201,150,42,0.25)'}; color: ${isCredit ? colors.success : colors.gold2}; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 20px;">${statusText}</div>
                <div style="font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 600; line-height: 1; color: ${isCredit ? colors.success : colors.cream}; margin: 5px 0; text-shadow: 0 0 40px ${isCredit ? 'rgba(52,211,153,0.3)' : 'rgba(245,208,122,0.2)'};">${isCredit ? '+ ' : ''}₹${Number(data.amount).toLocaleString('en-IN')}</div>
                <div style="position: absolute; top: 25px; right: 25px;">
                    <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px ${stampGlow});">
                        <circle cx="26" cy="26" r="23" fill="none" stroke="${isCredit ? colors.success : colors.gold2}" stroke-width="1.5" />
                        <polyline points="${isCredit ? '16,27 22,33 36,19' : '18,26 26,34 38,18'}" fill="none" stroke="${isCredit ? colors.success : colors.gold2}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>
            </div>
            <div style="position: relative; height: 1px; margin: 20px 0; border-top: 1px dashed rgba(255,255,255,0.06);"></div>
            <div style="padding: 14px 24px;">
                ${[
            { Reference: data.ref || 'TXN-' + Date.now().toString().slice(-8), Date: new Date(data.date || Date.now()).toLocaleString('en-IN') },
            { From: (data.sender || 'SURAKSHA TREASURY').toUpperCase(), To: (data.receiver || '---').toUpperCase() },
            { Procedure: data.procedure || 'sp_internal_transfer()', Auth: data.auth || 'OTP VERIFIED', Balance: '₹' + Number(data.balance || 0).toLocaleString('en-IN') }
        ].map(group => `
                    <div style="background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; overflow: hidden; margin-bottom: 10px; width: 100%;">
                        ${Object.entries(group).map(([k, v]) => `
                            <div style="display: flex; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                                <span style="font-family: 'JetBrains Mono', monospace; font-size: 9px; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.06em;">${k}</span>
                                <span style="font-size: 11px; font-weight: 500; color: ${k === 'Balance' ? colors.gold2 : colors.cream2}; text-align: right;">${v}</span>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <div style="margin: 0 24px 10px; padding: 8px 14px; border-radius: 8px; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.04); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-family: 'JetBrains Mono', monospace; font-size: 8px; color: ${colors.muted}; letter-spacing: 0.1em; text-transform: uppercase;">AES-256-GCM / TLS 1.3 SECURE RECORD</span>
                <span style="color: ${colors.muted}; font-size: 10px;">▾</span>
            </div>
            <div style="padding: 24px; text-align: center; background: rgba(0,0,0,0.18); border-top: 1px solid rgba(255,255,255,0.03);">
                <div style="font-family: 'Cormorant Garamond', serif; font-size: 12px; font-style: italic; color: ${colors.gold2}; opacity: 0.7; margin-bottom: 8px;">Thank you for banking with us</div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 8px; color: ${colors.muted}; line-height: 1.6; text-transform: uppercase;">Certified · Suraksha Bank Core Security Lab<br>Authorized for digital records only · DICGC · RBI</div>
            </div>
        </div>
    `;
};

/**
 * Format Currency to INR
 */
const formatINR = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/**
 * Generates a Bank Statement PDF with Premium Styling (Vault Edition)
 */
const generateStatementPDF = (accountInfo, transactions) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 0, size: 'A4' });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const { colors, fonts, spacing } = tokens;
            const margin = spacing.margin;
            const contentWidth = doc.page.width - (margin * 2);

            // --- HEADER ---
            doc.rect(0, 0, doc.page.width, 100).fill(colors.navy);

            // Logo Mark (SV)
            doc.roundedRect(margin, 32, 26, 26, 6).fill(colors.gold);
            doc.fillColor(colors.navy).font(fonts.mono).fontSize(10).text('SV', margin, 40, { width: 26, align: 'center' });

            doc.fillColor(colors.cream).font(fonts.bold).fontSize(22)
                .text('SURAKSHA BANK', margin + 35, 35);
            doc.fillColor(colors.gold2).font(fonts.mono).fontSize(9)
                .text('PREMIUM DIGITAL VAULT SYSTEM · CONSOLIDATED STATEMENT', margin + 35, 62, { characterSpacing: 1.2 });

            doc.fillColor(colors.white).font(fonts.bold).fontSize(12)
                .text('ACCOUNT STATEMENT', 0, 45, { align: 'right', width: doc.page.width - margin });

            let y = 130;

            // --- ACCOUNT SUMMARY CARD ---
            doc.roundedRect(margin, y, contentWidth, 85, 12).fill(colors.navyCard);
            doc.strokeColor(colors.navyRim).lineWidth(1).roundedRect(margin, y, contentWidth, 85, 12).stroke();

            doc.fillColor(colors.muted).font(fonts.mono).fontSize(7.5)
                .text('CUSTOMER ENTITY', margin + 25, y + 20);
            doc.fillColor(colors.cream).font(fonts.bold).fontSize(13)
                .text((accountInfo.full_name || accountInfo.CUSTOMER_NAME || 'VALUED CUSTOMER').toUpperCase(), margin + 25, y + 33);

            doc.fillColor(colors.muted).font(fonts.mono).fontSize(7.5)
                .text('ACCOUNT NUMBER', margin + 240, y + 20);
            doc.fillColor(colors.gold2).font(fonts.mono).fontSize(13)
                .text(accountInfo.account_number || accountInfo.ACCOUNT_NUMBER || '---', margin + 240, y + 33);

            doc.fillColor(colors.muted).font(fonts.mono).fontSize(7.5)
                .text('VALUATION DATE', margin + 380, y + 20);
            doc.fillColor(colors.cream2).font(fonts.primary).fontSize(10)
                .text(new Date().toLocaleDateString('en-IN'), margin + 380, y + 33);

            y += 115;

            // --- TRANSACTION LEDGER ---
            doc.fillColor(colors.cream).font(fonts.bold).fontSize(13)
                .text('TRANSACTION LEDGER', margin, y);
            y += 25;

            // Table Header 
            doc.roundedRect(margin, y, contentWidth, 28, 4).fill(colors.navyDeep);
            doc.strokeColor(colors.navyRim).lineWidth(0.5).roundedRect(margin, y, contentWidth, 28, 4).stroke();
            doc.fillColor(colors.gold2).font(fonts.mono).fontSize(8.5);

            const col1 = margin + 12;
            const col2 = margin + 100;
            const col3 = margin + 310;
            const col4 = margin + 410;

            doc.text('DATE', col1, y + 10);
            doc.text('DESCRIPTION / REFERENCE', col2, y + 10);
            doc.text('SETTLEMENT', col3, y + 10, { width: 90, align: 'right' });
            doc.text('BALANCE', col4, y + 10, { width: 90, align: 'right' });

            y += 35;

            // Table Rows
            transactions.forEach((t, i) => {
                const dateStr = new Date(t.TRANSACTION_DATE || t.transaction_date).toLocaleDateString('en-IN');
                const desc = (t.DESCRIPTION || t.description || 'General Transaction').slice(0, 40);
                const type = (t.TRANSACTION_TYPE || t.transaction_type || '').toUpperCase();
                const amtRaw = Number(t.AMOUNT || t.amount || 0);
                const isCredit = type.includes('CREDIT') || type.includes('DEPOSIT');
                const balance = Number(t.BALANCE_AFTER || t.balance_after || 0);

                if (y > 740) {
                    doc.addPage();
                    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.navy);
                    y = 50;
                    // Redraw sub-header
                    doc.roundedRect(margin, y, contentWidth, 25, 4).fill(colors.navyDeep);
                    doc.fillColor(colors.gold2).font(fonts.mono).fontSize(8.5);
                    doc.text('DATE', col1, y + 8);
                    doc.text('DESCRIPTION', col2, y + 8);
                    doc.text('SETTLEMENT', col3, y + 8, { width: 90, align: 'right' });
                    doc.text('BALANCE', col4, y + 8, { width: 90, align: 'right' });
                    y += 32;
                }

                // Row Separator
                doc.strokeColor(colors.navyRim).lineWidth(0.5)
                    .moveTo(margin, y + 20).lineTo(margin + contentWidth, y + 20).stroke();

                doc.fillColor(colors.cream2).font(fonts.primary).fontSize(9);
                doc.text(dateStr, col1, y + 5);
                doc.fillColor(colors.muted).font(fonts.mono).fontSize(8.5).text(desc, col2, y + 5);

                doc.fillColor(isCredit ? colors.success : colors.danger).font(fonts.bold)
                    .text((isCredit ? '+ ' : '- ') + formatINR(amtRaw), col3, y + 5, { width: 90, align: 'right' });

                doc.fillColor(colors.cream).font(fonts.bold)
                    .text(formatINR(balance), col4, y + 5, { width: 90, align: 'right' });

                y += 28;
            });

            // --- FOOTER ---
            const footerY = doc.page.height - 70;
            doc.rect(0, footerY, doc.page.width, 70).fill(colors.navyDeep || colors.navy);
            doc.fillColor(colors.muted).font(fonts.mono).fontSize(7.5).opacity(0.6)
                .text('CERTIFIED CRYPTOGRAPHIC RECORD · SURAKSHA BANK CORE SYSTEM · AUTHORIZED FOR DIGITAL RECORDS ONLY', 0, footerY + 25, { align: 'center', width: doc.page.width });

            doc.fillColor(colors.gold2).font(fonts.bold).fontSize(9).opacity(0.8)
                .text('SURAKSHA BANK | SAFE VAULT | ALL RIGHTS RESERVED', 0, footerY + 45, { align: 'center', width: doc.page.width, characterSpacing: 1.2 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Generates an Ultra-Premium High-Fidelity Transaction Receipt PDF (v2 Vault Edition)
 */
const generateTransactionReceiptPDF = (data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const { colors, fonts } = tokens;
            const isCredit = (data.dir || 'DR') === 'CR' || (data.type || '').includes('credit') || (data.type || '').includes('deposit');

            // --- 0. BACKGROUND & CONTAINER ---
            doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.navy);

            const cardW = 400;
            const cardX = (doc.page.width - cardW) / 2;
            const cardY = 60;
            const cardH = 680;

            // Card Shadow/Glow
            doc.save();
            doc.opacity(0.15);
            doc.roundedRect(cardX - 10, cardY + 10, cardW + 20, cardH, 16).fill('#000000');
            doc.restore();

            // Main Card
            const outlineColor = isCredit ? colors.success : colors.gold2;
            doc.roundedRect(cardX, cardY, cardW, cardH, 16).fill(colors.navyCard);

            // Glow Outline
            doc.save();
            doc.strokeColor(outlineColor);
            doc.strokeOpacity(0.18).lineWidth(1);
            doc.roundedRect(cardX, cardY, cardW, cardH, 16).stroke();
            doc.strokeOpacity(0.3).lineWidth(1);
            doc.moveTo(cardX + 16, cardY - 1).lineTo(cardX + cardW - 16, cardY - 1).stroke();
            doc.restore();

            // Top Gradient Accent (Simulated)
            const accentW = 240;
            doc.save();
            doc.rect(cardX + (cardW - accentW) / 2, cardY, accentW, 3).fill(isCredit ? colors.success : colors.gold2);
            doc.restore();

            // --- 1. WATERMARK ---
            doc.save();
            doc.opacity(0.035).font(fonts.bold).fontSize(52).fillColor(colors.gold);
            doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
            doc.text('SAFE VAULT', 0, doc.page.height / 2 - 26, { align: 'center', width: doc.page.width });
            doc.restore();

            let y = cardY + 30;

            // --- 2. HEADER: SV LOGO & BANK NAME ---
            // Logo Mark
            const logoSize = 26;
            // Header Content Centering
            const bankNameWidth = 140; // Approx
            const headerTotalW = logoSize + 10 + bankNameWidth;
            const headerStartX = cardX + (cardW - headerTotalW) / 2;

            doc.roundedRect(headerStartX, y - 2, logoSize, logoSize, 6).fill(colors.gold);
            doc.fillColor(colors.navy).font(fonts.mono).fontSize(10).text('SV', headerStartX, y + 6, { width: logoSize, align: 'center' });

            doc.fillColor(colors.cream).font(fonts.bold).fontSize(17)
                .text('SURAKSHA BANK', headerStartX + 35, y + 2);
            y += 35;
            doc.font(fonts.mono).fontSize(8).fillColor(colors.gold2).opacity(0.7)
                .text('SAFE VAULT · SECURE TRANSACTION RECEIPT', cardX, y, { align: 'center', width: cardW, characterSpacing: 1.2 });
            y += 35;

            // --- 3. SUCCESS STAMP (Top Right) ---
            const stampX = cardX + cardW - 60;
            const stampY = cardY + 25;
            doc.save();
            const stampColor = isCredit ? colors.success : colors.gold2;
            doc.strokeColor(stampColor).lineWidth(1.5);

            // Simulated Glow
            doc.save();
            doc.strokeOpacity(0.2).lineWidth(6);
            doc.circle(stampX + 20, stampY + 20, 23).stroke();
            doc.restore();

            doc.circle(stampX + 20, stampY + 20, 23).stroke();
            doc.lineWidth(2.5).lineCap('round').lineJoin('round');
            if (isCredit) {
                doc.moveTo(stampX + 13, stampY + 22).lineTo(stampX + 19, stampY + 28).lineTo(stampX + 30, stampY + 16).stroke();
            } else {
                doc.moveTo(stampX + 15, stampY + 21).lineTo(stampX + 22, stampY + 29).lineTo(stampX + 32, stampY + 15).stroke();
            }
            doc.restore();

            // --- 4. AMOUNT SECTION ---
            // Status Pill
            const pillW = 200;
            const pillX = cardX + (cardW - pillW) / 2;
            doc.save();
            doc.fillColor(isCredit ? colors.success : colors.gold2).fillOpacity(0.12);
            doc.roundedRect(pillX, y, pillW, 20, 10).fill();
            doc.strokeColor(isCredit ? colors.success : colors.gold2).strokeOpacity(0.25).lineWidth(0.5);
            doc.roundedRect(pillX, y, pillW, 20, 10).stroke();
            doc.restore();

            const txnStatus = (data.status || (isCredit ? 'PAYMENT RECEIVED' : 'PAYMENT SUCCESSFUL')).toUpperCase();
            doc.fillColor(isCredit ? colors.success : colors.gold2).font(fonts.mono).fontSize(8)
                .text(txnStatus, cardX, y + 6, { align: 'center', width: cardW, characterSpacing: 1 });
            y += 40;

            // Big Amount with "Glow"
            doc.save();
            doc.opacity(0.12);
            doc.circle(cardX + cardW / 2, y + 15, 40).fill(isCredit ? colors.success : colors.gold);
            doc.restore();

            const amtStr = (isCredit ? '+ ' : '') + formatINR(data.amount);
            doc.fillColor(isCredit ? colors.success : colors.cream).font(fonts.bold).fontSize(38)
                .text(amtStr, cardX, y, { align: 'center', width: cardW });
            y += 45;

            // --- 5. DATA TABLES ---
            const drawTearLine = (currY) => {
                doc.save();
                doc.strokeColor('rgba(255,255,255,0.06)').dash(2, { space: 4 }).lineWidth(1);
                doc.moveTo(cardX + 20, currY).lineTo(cardX + cardW - 20, currY).stroke();
                doc.restore();
            };

            const drawDataTable = (rows, currY) => {
                const tablePadding = 14;
                const tableH = (rows.length * 28) + 10;
                doc.roundedRect(cardX + 18, currY, cardW - 36, tableH, 10).fill(colors.navyDeep);
                doc.strokeColor(colors.navyRim).lineWidth(1).roundedRect(cardX + 18, currY, cardW - 36, tableH, 10).stroke();

                let rowY = currY + 12;
                rows.forEach((row, i) => {
                    doc.fillColor(colors.muted).font(fonts.mono).fontSize(8.5).text(row.k.toUpperCase(), cardX + 32, rowY);
                    doc.fillColor(row.highlight ? colors.gold2 : colors.cream2).font(row.highlight ? fonts.bold : fonts.primary).fontSize(10.5)
                        .text(row.v, cardX + 32, rowY, { align: 'right', width: cardW - 64 });

                    rowY += 28;
                    if (i < rows.length - 1) {
                        doc.strokeColor(colors.navyRim).lineWidth(0.5).moveTo(cardX + 32, rowY - 14).lineTo(cardX + cardW - 32, rowY - 14).stroke();
                    }
                });
                return tableH + 12;
            };

            drawTearLine(y);
            y += 18;

            // Table 1: Reference & Timing
            y += drawDataTable([
                { k: 'Reference', v: (data.ref || 'TXN-' + Date.now().toString().slice(-8)).toUpperCase() },
                { k: 'Date & Time', v: new Date(data.date || Date.now()).toLocaleString('en-IN') }
            ], y);

            // Table 2: Entities
            y += drawDataTable([
                { k: 'From', v: (data.sender || 'SURAKSHA TREASURY').toUpperCase() },
                { k: 'To', v: (data.receiver || '---').toUpperCase() }
            ], y);

            // Table 3: Security & Balance
            y += drawDataTable([
                { k: 'Procedure', v: data.procedure || 'sp_internal_transfer()' },
                { k: 'Authentication', v: data.auth || 'OTP VERIFIED (Customer Session)' },
                { k: 'Updated Balance', v: formatINR(data.balance), highlight: true }
            ], y);

            // --- 6. SECURITY DETAILS EXPANDED LOOK ---
            y += 10;
            const secBoxH = 80;
            doc.roundedRect(cardX + 18, y, cardW - 36, 28, 8).fill(colors.navyDeep);
            doc.strokeColor(colors.navyRim).lineWidth(1).roundedRect(cardX + 18, y, cardW - 36, 28, 8).stroke();
            doc.fillColor(colors.muted).font(fonts.mono).fontSize(8.5).text('SECURITY DETAILS', cardX + 32, y + 10);
            doc.text('▾', cardX + cardW - 45, y + 10);
            y += 35;

            // Simulated Expanded Box
            doc.roundedRect(cardX + 18, y, cardW - 36, 60, 8).fill(colors.navyDeep);
            doc.strokeColor(colors.navyRim).lineWidth(1).roundedRect(cardX + 18, y, cardW - 36, 60, 8).stroke();

            doc.fillColor(colors.muted).fontSize(8).font(fonts.mono);
            doc.text('TXN HASH', cardX + 32, y + 12);
            doc.fillColor(colors.muted).text('SHA-256:A4F2E...82B', cardX + cardW - 200, y + 12, { align: 'right', width: 168 });

            doc.text('SESSION', cardX + 32, y + 30);
            doc.text('SURAKSHA_CTX:AUTH_TOKEN_772', cardX + cardW - 200, y + 30, { align: 'right', width: 168 });

            doc.text('ENCRYPTION', cardX + 32, y + 48);
            doc.text('AES-256-GCM · TLS 1.3', cardX + cardW - 200, y + 48, { align: 'right', width: 168 });
            y += 75;

            drawTearLine(y);
            y += 15;

            // --- 7. FOOTER ---
            doc.fillColor(colors.gold2).opacity(0.7).font(fonts.primary).fontSize(10)
                .text('Thank you for banking with us', cardX, y, { align: 'center', width: cardW });
            y += 20;

            doc.fillColor(colors.muted).font(fonts.mono).fontSize(7.5).opacity(0.6)
                .text('CERTIFIED · SURAKSHA BANK CORE SECURITY LAB\nAUTHORISED FOR DIGITAL RECORDS ONLY · DICGC · RBI', cardX, y, { align: 'center', width: cardW, lineGap: 3 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = {
    generateStatementPDF,
    generateTransactionReceiptPDF,
    generateTransactionReceiptHTML
};
