const tokens = require('./designTokens');
const { colors } = tokens;

const baseStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    body { 
        font-family: 'DM Sans', 'Helvetica', Arial, sans-serif; 
        margin: 0; padding: 0; 
        background-color: ${colors.navy}; 
        color: ${colors.cream}; 
        -webkit-font-smoothing: antialiased;
    }
    .container { 
        max-width: 520px; 
        margin: 40px auto; 
        background: linear-gradient(160deg, ${colors.navyCard} 0%, ${colors.navyMid} 100%);
        overflow: hidden; 
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 16px; 
        box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        position: relative;
    }
    .container.glow-success {
        border-color: rgba(52,211,153,0.18);
        box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.18), 0 -1px 0 rgba(52,211,153,0.3);
    }
    .container.glow-gold {
        border-color: rgba(232,184,75,0.18);
        box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,184,75,0.18), 0 -1px 0 rgba(232,184,75,0.3);
    }
    .container.glow-sky {
        border-color: rgba(56,189,248,0.18);
        box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(56,189,248,0.18), 0 -1px 0 rgba(56,189,248,0.3);
    }
    /* Top Gradient Bar */
    .top-accent {
        height: 3px;
        background: linear-gradient(90deg, transparent 0%, ${colors.gold2} 40%, ${colors.gold2} 60%, transparent 100%);
    }
    .top-accent.credit {
        background: linear-gradient(90deg, transparent 0%, ${colors.success} 40%, ${colors.success} 60%, transparent 100%);
    }

    /* SAFE VAULT WATERMARK */
    .watermark-bg {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iODAwIj48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IidDb3Jtb3JhbnQgR2FyYW1vbmQnLCBzZXJpZiIgZm9udC1zaXplPSI1MiIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI0M5OTYyQSIgb3BhY2l0eT0iMC4wMzUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIHRyYW5zZm9ybT0icm90YXRlKC0zNSwgMzAwLCA0MDApIiBsZXR0ZXItc3BhY2luZz0iMC4xZW0iPlNBRkUgVkFVTFQ8L3RleHQ+PC9zdmc+");
        background-position: center;
        background-repeat: no-repeat;
        pointer-events: none;
        z-index: 0;
    }

    .header { 
        padding: 30px 24px 20px; 
        text-align: center; 
        border-bottom: 1px solid rgba(255,255,255,0.04); 
        position: relative; z-index: 1;
    }
    .header-content {
        display: inline-block;
        vertical-align: middle;
    }
    .logo-mark {
        display: inline-block;
        vertical-align: middle;
        width: 26px; height: 26px;
        background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.gold2} 100%);
        border-radius: 6px;
        line-height: 26px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px; font-weight: 700; color: ${colors.navy};
        margin-right: 10px;
        box-shadow: 0 2px 8px rgba(201,150,42,0.3);
    }
    .bank-name-wrapper {
        display: inline-block;
        vertical-align: middle;
        text-align: left;
    }
    .bank-name { 
        font-family: 'Cormorant Garamond', serif;
        color: ${colors.cream}; 
        margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.06em;
        line-height: 1;
    }
    .header-tag {
        font-family: 'JetBrains Mono', monospace;
        font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase;
        color: ${colors.gold2}; opacity: 0.7; margin-top: 4px;
    }

    .content { padding: 0; position: relative; z-index: 1; }

    .amount-section { 
        text-align: center; 
        padding: 30px 24px 25px; 
        position: relative;
    }
    .status-pill {
        display: inline-block;
        padding: 5px 14px;
        border-radius: 20px;
        background: rgba(201,150,42,0.1);
        border: 1px solid rgba(201,150,42,0.25);
        color: ${colors.gold2};
        font-family: 'JetBrains Mono', monospace;
        font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-bottom: 12px;
    }
    .status-pill.credit {
        background: ${colors.success}1a;
        border-color: ${colors.success}40;
        color: ${colors.success};
    }
    .big-amount {
        font-family: 'Cormorant Garamond', serif;
        font-size: 42px; font-weight: 600; line-height: 1;
        color: ${colors.cream};
        margin: 15px 0;
        text-shadow: 0 0 40px rgba(245,208,122,0.2);
    }
    .big-amount.credit {
        color: ${colors.success};
        text-shadow: 0 0 40px rgba(52,211,153,0.3);
    }

    /* Tear Line */
    .tear-line {
        position: relative;
        height: 1px;
        margin: 20px 0;
        border-top: 1px dashed rgba(255,255,255,0.06);
    }
    .tear-line::before, .tear-line::after {
        content: "";
        position: absolute;
        top: -10px; width: 10px; height: 20px;
        background: ${colors.navy};
    }
    .tear-line::before { left: -1px; border-radius: 0 10px 10px 0; }
    .tear-line::after { right: -1px; border-radius: 10px 0 0 10px; }

    /* Data Tables */
    .table-container { padding: 14px 24px; }
    .data-table {
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(255,255,255,0.04);
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 10px;
        width: 100%;
        border-collapse: collapse;
    }
    .data-row { border-bottom: 1px solid rgba(255,255,255,0.03); }
    .data-row:last-child { border-bottom: none; }
    .data-key {
        font-family: 'JetBrains Mono', monospace;
        font-size: 9px; color: ${colors.muted}; 
        padding: 10px 16px; width: 40%;
        text-transform: uppercase; letter-spacing: 0.06em;
    }
    .data-val {
        font-family: 'DM Sans', sans-serif;
        font-size: 11px; font-weight: 500; color: ${colors.cream2};
        padding: 10px 16px; text-align: right; line-height: 1.4;
    }
    .val-highlight { color: ${colors.gold2}; font-weight: 700; }

    /* Security Details Box */
    .security-summary {
        margin: 0 24px 10px;
        padding: 8px 14px;
        border-radius: 8px;
        background: rgba(0,0,0,0.12);
        border: 1px solid rgba(255,255,255,0.04);
        display: flex; justify-content: space-between; align-items: center;
    }
    .security-tag {
        font-family: 'JetBrains Mono', monospace;
        font-size: 8px; color: ${colors.muted}; letter-spacing: 0.1em; text-transform: uppercase;
    }

    .btn-container { text-align: center; padding: 25px 24px; }
    .btn { 
        display: inline-block; 
        background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.gold2} 100%);
        color: ${colors.navy} !important; 
        padding: 12px 36px; border-radius: 8px; text-decoration: none; 
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700; font-size: 11px; letter-spacing: 0.1em;
        text-transform: uppercase;
        box-shadow: 0 4px 16px rgba(201,150,42,0.3);
    }

    .footer { 
        padding: 24px; text-align: center; 
        background: rgba(0,0,0,0.18); 
        border-top: 1px solid rgba(255,255,255,0.03); 
        position: relative; z-index: 1;
    }
    .footer-note { font-family: 'Cormorant Garamond', serif; font-size: 12px; font-style: italic; color: ${colors.gold2}; opacity: 0.7; margin-bottom: 8px; }
    .footer-cert { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: ${colors.muted}; line-height: 1.6; text-transform: uppercase; letter-spacing: 0.05em; }
    
    .security-notice { 
        margin: 30px 24px; padding-top: 20px;
        border-top: 1px solid rgba(255,255,255,0.05); 
        color: ${colors.danger}; font-size: 11px; line-height: 1.6; 
        font-family: 'DM Sans', sans-serif;
    }

    /* Success Stamp Overlays */
    .stamp-container { position: absolute; top: 25px; right: 25px; pointer-events: none; }
`;

const emailLayout = (title, subtitle, contentHtml, isCredit = false, glowClass = '') => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${baseStyles}</style>
    </head>
    <body>
        <div class="container ${glowClass}">
            <div class="top-accent ${isCredit ? 'credit' : ''}"></div>
            <div class="watermark-bg"></div>
            <div class="header">
                <div class="header-content">
                    <div class="logo-mark">SV</div>
                    <div class="bank-name-wrapper">
                        <div class="bank-name">SURAKSHA BANK</div>
                    </div>
                </div>
                <div class="header-tag">SAFE VAULT · SECURE TRANSACTION RECEIPT</div>
            </div>
            <div class="content">
                ${contentHtml}
                <div class="security-notice">
                    <b style="letter-spacing: 0.05em;">SECURITY PROTOCOL ALERT:</b> This is an encrypted cryptographic notification from the Suraksha Bank Core Defense System. If you did not authorize this activity, please contact our Security Operations Center immediately.
                </div>
            </div>
            <div class="footer">
                <div class="footer-note">Thank you for banking with us</div>
                <div class="footer-cert">Certified · Suraksha Bank Core Security Lab<br>Authorized for digital records only · DICGC · RBI</div>
            </div>
        </div>
    </body>
    </html>
`;

const templates = {
    otp: (name, code) => emailLayout(
        'Identity Verification',
        'Authorization required for secure access.',
        `
        <div class="amount-section">
            <div class="stamp-container" style="top: 20px; right: 20px;">
                <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px rgba(232,184,75,0.4));">
                    <circle cx="26" cy="26" r="23" fill="none" stroke="${colors.gold2}" stroke-width="1.5" />
                    <rect x="18" y="24" width="16" height="12" rx="2" fill="none" stroke="${colors.gold2}" stroke-width="2" />
                    <path d="M20 24 V18 C20 14 32 14 32 18 V24" fill="none" stroke="${colors.gold2}" stroke-width="2" />
                    <circle cx="26" cy="30" r="1.5" fill="${colors.gold2}" />
                </svg>
            </div>
            <div class="status-pill">IDENTITY VERIFICATION</div>
            <h2 style="color: ${colors.white}; margin: 10px 0; font-family: 'Cormorant Garamond', serif; font-size: 24px;">Authorization Required</h2>
            <div style="background: rgba(13, 27, 42, 0.4); border: 1px solid rgba(255,255,255,0.05); padding: 35px; border-radius: 12px; margin-top: 20px;">
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 42px; font-weight: 700; color: ${colors.gold2}; letter-spacing: 10px; margin-bottom: 10px;">${code}</div>
                <div style="font-size: 10px; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.1em;">SECURE OTP TOKEN</div>
            </div>
            <p style="font-size: 12px; color: ${colors.muted}; margin-top: 25px; padding: 0 20px;">Hello ${name}, use this cryptographic token to proceed with bridge authentication. Valid for 1 minute only.</p>
        </div>
        `,
        false,
        'glow-gold'
    ),
    stopChequeOtp: (name, code, chequeNumber, reason) => emailLayout(
        'Stop Payment Verification',
        'Authorization required to stop cheque.',
        `
        <div class="amount-section">
            <div class="stamp-container" style="top: 20px; right: 20px;">
                <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px rgba(239,68,68,0.4));">
                    <circle cx="26" cy="26" r="23" fill="none" stroke="${colors.danger || '#EF4444'}" stroke-width="1.5" />
                    <line x1="18" y1="26" x2="34" y2="26" stroke="${colors.danger || '#EF4444'}" stroke-width="2.5" stroke-linecap="round" />
                </svg>
            </div>
            <div class="status-pill" style="background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: ${colors.danger || '#EF4444'};">STOP PAYMENT</div>
            <h2 style="color: ${colors.white}; margin: 10px 0; font-family: 'Cormorant Garamond', serif; font-size: 24px;">Stop Instalment Authorized</h2>
            <p style="font-size: 13px; color: ${colors.cream2}; line-height: 1.6; padding: 0 20px;">Hello ${name},<br>You have requested to stop the payment for Cheque Number: <b>${chequeNumber}</b>.</p>
            <p style="font-size: 12px; color: ${colors.muted}; padding: 0 20px; font-style: italic;">Reason: ${reason}</p>
            <div style="background: rgba(13, 27, 42, 0.4); border: 1px solid rgba(255,255,255,0.05); padding: 35px; border-radius: 12px; margin-top: 20px;">
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 42px; font-weight: 700; color: ${colors.gold2}; letter-spacing: 10px; margin-bottom: 10px;">${code}</div>
                <div style="font-size: 10px; color: ${colors.muted}; text-transform: uppercase; letter-spacing: 0.1em;">SECURE OTP TOKEN</div>
            </div>
            <p style="font-size: 12px; color: ${colors.muted}; margin-top: 25px; padding: 0 20px;">Use this cryptographic token to authorize the stop payment. Valid for 10 minutes.</p>
        </div>
        `,
        false,
        'glow-gold'
    ),
    transaction: (name, txnData) => {
        const type = (txnData.type || '').toLowerCase();
        const isCredit = (txnData.dir === 'CR') || type.includes('credit') || type.includes('deposit') || type.includes('received');
        const statusText = (txnData.status || (isCredit ? 'Payment Received' : 'Payment Successful')).toUpperCase();

        return emailLayout(
            'Transaction alert',
            'Vault activity detected.',
            `
            <div class="amount-section">
                <!-- Success Stamp -->
                <div class="stamp-container">
                    <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px ${isCredit ? 'rgba(52,211,153,0.4)' : 'rgba(232,184,75,0.4)'});">
                        <circle cx="26" cy="26" r="23" fill="none" stroke="${isCredit ? colors.success : colors.gold2}" stroke-width="1.5" />
                        <polyline points="${isCredit ? '16,27 22,33 36,19' : '18,26 26,34 38,18'}" fill="none" stroke="${isCredit ? colors.success : colors.gold2}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>

                <div class="status-pill ${isCredit ? 'credit' : ''}">${statusText}</div>
                <div class="big-amount ${isCredit ? 'credit' : ''}">${isCredit ? '+ ' : ''}₹${Number(txnData.amount).toLocaleString('en-IN')}</div>
            </div>

            <div class="tear-line"></div>

            <div class="table-container">
                <table class="data-table">
                    <tr class="data-row">
                        <td class="data-key">Reference</td>
                        <td class="data-val">${txnData.ref || 'TXN-' + Date.now().toString().slice(-8)}</td>
                    </tr>
                    <tr class="data-row">
                        <td class="data-key">Date & Time</td>
                        <td class="data-val">${new Date(txnData.date || Date.now()).toLocaleString('en-IN')}</td>
                    </tr>
                </table>

                <table class="data-table">
                    <tr class="data-row">
                        <td class="data-key">Entity From</td>
                        <td class="data-val">${(txnData.sender || 'SURAKSHA TREASURY').toUpperCase()}</td>
                    </tr>
                    <tr class="data-row">
                        <td class="data-key">Entity To</td>
                        <td class="data-val">${(txnData.receiver || '---').toUpperCase()}</td>
                    </tr>
                </table>

                <table class="data-table">
                    <tr class="data-row">
                        <td class="data-key">Core Procedure</td>
                        <td class="data-val">${txnData.procedure || 'sp_internal_transfer()'}</td>
                    </tr>
                    <tr class="data-row">
                        <td class="data-key">Auth Mechanism</td>
                        <td class="data-val">${txnData.auth || 'OTP VERIFIED'}</td>
                    </tr>
                    <tr class="data-row">
                        <td class="data-key">Updated Balance</td>
                        <td class="data-val val-highlight">₹${Number(txnData.balance || 0).toLocaleString('en-IN')}</td>
                    </tr>
                </table>
            </div>

            <div class="security-summary">
                <span class="security-tag">Security Protocol: AES-256-GCM / TLS 1.3</span>
                <span style="color: ${colors.muted}; font-size: 10px;">▾</span>
            </div>

            <div class="btn-container">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">Review Settlement Details</a>
            </div>
            `,
            isCredit,
            isCredit ? 'glow-success' : 'glow-gold'
        );
    },
    update: (name, message) => emailLayout(
        'Profile Update',
        'Security record modification.',
        `
        <div class="amount-section">
            <div class="stamp-container" style="top: 20px; right: 20px;">
                <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px rgba(56,189,248,0.4));">
                    <circle cx="26" cy="26" r="23" fill="none" stroke="${colors.sky}" stroke-width="1.5" />
                    <path d="M26 14 L16 18 V26 C16 33 20 38 26 40 C32 38 36 33 36 26 V18 Z" fill="none" stroke="${colors.sky}" stroke-width="1.5" />
                    <circle cx="26" cy="24" r="3" fill="none" stroke="${colors.sky}" stroke-width="1.5" />
                    <path d="M20 32 C21 29 24 28 26 28 C28 28 31 29 32 32" fill="none" stroke="${colors.sky}" stroke-width="1.5" stroke-linecap="round" />
                </svg>
            </div>
            <div class="status-pill" style="background: rgba(56,189,248,0.1); border-color: rgba(56,189,248,0.25); color: ${colors.sky};">SECURITY ALERT</div>
            <h2 style="color: ${colors.white}; margin: 15px 0; font-family: 'Cormorant Garamond', serif; font-size: 22px;">Profile Modified</h2>
            <p style="font-size: 13px; color: ${colors.cream2}; line-height: 1.6; padding: 0 20px;">Hello ${name},<br>${message}</p>
        </div>
        <div class="btn-container">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">Verify Account Activity</a>
        </div>
        `,
        false,
        'glow-sky'
    ),
    bounce: (name, chequeNumber, amount) => emailLayout(
        'Transaction Failed',
        'Cheque Bounced Alert.',
        `
        <div class="amount-section">
            <div class="stamp-container" style="top: 20px; right: 20px;">
                <svg width="48" height="48" viewBox="0 0 52 52" style="filter: drop-shadow(0 0 12px rgba(239,68,68,0.4));">
                    <circle cx="26" cy="26" r="23" fill="none" stroke="${colors.danger || '#EF4444'}" stroke-width="1.5" />
                    <line x1="18" y1="18" x2="34" y2="34" stroke="${colors.danger || '#EF4444'}" stroke-width="2.5" stroke-linecap="round" />
                    <line x1="18" y1="34" x2="34" y2="18" stroke="${colors.danger || '#EF4444'}" stroke-width="2.5" stroke-linecap="round" />
                </svg>
            </div>
            <div class="status-pill" style="background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: ${colors.danger || '#EF4444'};">CHEQUE BOUNCED</div>
            <h2 style="color: ${colors.white}; margin: 15px 0; font-family: 'Cormorant Garamond', serif; font-size: 22px;">Insufficient Funds</h2>
            <p style="font-size: 13px; color: ${colors.cream2}; line-height: 1.6; padding: 0 20px;">Hello ${name},<br>Your cheque number <b>${chequeNumber}</b> for the amount of <b>₹${Number(amount).toLocaleString('en-IN')}</b> has bounced due to insufficient funds in your account. Please log in to check your balance. Penalty charges may apply.</p>
        </div>
        <div class="btn-container">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">View Account Details</a>
        </div>
        `,
        false,
        'glow-gold'
    )
};

module.exports = templates;
