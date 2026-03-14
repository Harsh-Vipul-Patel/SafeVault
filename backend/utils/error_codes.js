const ORACLE_ERRORS = {
    // KYC
    20032: 'Cannot verify KYC for own account',
    20050: 'Customer KYC validation failed',
    // FD/RD
    20041: 'FD maturity date not yet reached',
    20042: 'FD already matured or closed',
    // Beneficiary
    20060: 'Beneficiary already exists',
    20061: '24-hour cooling period not elapsed',
    20062: 'Beneficiary not owned by this customer',
    20063: 'Beneficiary not active',
    // Cheque
    20030: 'Account not eligible for cheque book',
    20031: 'Customer KYC expired — cannot issue cheque book',
    20033: 'Cannot stop payment on a cleared cheque',
    20034: 'Cheque number not found in any active cheque book',
    20035: 'Stop payment instruction is active for this cheque',
    20036: 'Insufficient balance — cheque will bounce',
    // Service Request
    20042: 'Service request belongs to different branch',
    20043: 'Resolved service requests are immutable',
    // MIS
    20040: 'Branch scope violation — cannot access other branch MIS',
};

const mapOracleError = (err) => {
    const errorNum = err.errorNum || (err.message && err.message.match(/ORA-(\d+)/)?.[1]);
    if (ORACLE_ERRORS[errorNum]) {
        return { status: 400, message: ORACLE_ERRORS[errorNum] };
    }

    // Custom mapping for specific constraint violations
    if (err.message && err.message.includes('SYS_C009616')) {
        return { status: 400, message: 'Invalid IFSC Code format. The 5th character must be zero (0).' };
    }

    return { status: 500, message: err.message };
};

module.exports = {
    ORACLE_ERRORS,
    mapOracleError
};
