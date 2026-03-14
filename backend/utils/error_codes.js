const PG_ERRORS = {
    // Financial (P0001-P0009)
    'P0001': 'Insufficient funds for operation.',
    'P0002': 'Account is not ACTIVE or is restricted.',
    'P0004': 'Originating account not found.',
    'P0005': 'Target account not found.',
    
    // KYC (P0010-P0019)
    'P0032': 'Cannot verify KYC for own account',
    'P0050': 'Customer KYC validation failed',
    
    // FD/RD (P0020-P0029)
    'P0041': 'FD maturity date not yet reached',
    'P0042': 'FD already matured or closed',
};

const mapOracleError = (err) => {
    // In PostgreSQL, the code is often in err.code
    const errorCode = err.code || (err.message && err.message.match(/code: ([P\d]+)/)?.[1]);
    
    if (PG_ERRORS[errorCode]) {
        return { status: 400, message: PG_ERRORS[errorCode] };
    }

    // Default error handling
    return { status: 500, message: err.message || 'Internal server error.' };
};

module.exports = {
    PG_ERRORS,
    mapOracleError // Kept name for compatibility
};
