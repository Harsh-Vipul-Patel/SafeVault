/**
 * Design Tokens for Suraksha Bank Communications (PDF & Email)
 * Aligning with the "Pearl Vault" aesthetic.
 */

const tokens = {
    colors: {
        navy: '#0D1B2A',
        navyCard: '#162032',
        navyDeep: '#0A1520',
        navyMid: '#162032',
        navyRim: '#1E2D42',
        gold: '#C9962A',
        goldSoft: '#E8B84B',
        gold2: '#E8B84B',
        gold3: '#F5D07A',
        cream: '#F5F0E8',
        cream2: '#EDE7D9',
        muted: '#6B7E95',
        success: '#3DD68C',
        danger: '#FF8080',
        violet: '#A78BFA',
        sky: '#38BDF8',
        white: '#FFFFFF',
        pearlBg: '#F2F3F0',
        glassBorder: 'rgba(201, 150, 42, 0.2)',
        glassBg: 'rgba(255, 255, 255, 0.03)',
        glassGlow: 'rgba(201, 150, 42, 0.12)',
        sources: {
            teller: { bg: 'rgba(46, 110, 196, 0.15)', text: '#7EB2FF', border: 'rgba(46, 110, 196, 0.3)' },
            internal: { bg: 'rgba(61, 214, 140, 0.12)', text: '#3DD68C', border: 'rgba(61, 214, 140, 0.25)' },
            netbanking: { bg: 'rgba(201, 150, 42, 0.12)', text: '#E8B84B', border: 'rgba(201, 150, 42, 0.25)' },
            atm: { bg: 'rgba(155, 46, 196, 0.12)', text: '#C97BFF', border: 'rgba(155, 46, 196, 0.3)' },
            pos: { bg: 'rgba(230, 160, 30, 0.12)', text: '#FFC04D', border: 'rgba(230, 160, 30, 0.3)' },
            cheque: { bg: 'rgba(100, 160, 255, 0.12)', text: '#99CAFF', border: 'rgba(100, 160, 255, 0.3)' },
            loan: { bg: 'rgba(61, 184, 138, 0.12)', text: '#3DB88A', border: 'rgba(61, 184, 138, 0.3)' },
            external: { bg: 'rgba(255, 140, 80, 0.12)', text: '#FFA060', border: 'rgba(255, 140, 80, 0.3)' }
        }
    },
    fonts: {
        primary: 'Helvetica',
        bold: 'Helvetica-Bold',
        mono: 'Courier'
    },
    spacing: {
        margin: 50,
        indent: 30
    },
    radius: 8
};

module.exports = tokens;
