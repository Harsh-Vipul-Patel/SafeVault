'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerDeposits() {
    const [deposits, setDeposits] = useState({ fixedDeposits: [], recurringDeposits: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Modal state for Closure OTP
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [closingDeposit, setClosingDeposit] = useState(null); // { id: '...', type: 'FD'|'RD' }
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchDeposits();
    }, []);

    const fetchDeposits = () => {
        setLoading(true);
        const token = getToken();
        if (!token) {
            setLoading(false);
            return;
        }
        fetch(`${API}/api/customer/deposits`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setDeposits({
                    fixedDeposits: data.fixedDeposits || [],
                    recurringDeposits: data.recurringDeposits || []
                });
                setLoading(false);
            })
            .catch(err => {
                setError('Failed to fetch deposit details.');
                setLoading(false);
            });
    };

    const handleInitiateClosure = async (depositId, type) => {
        setActionLoading(true);
        setError('');
        setSuccessMsg('');
        const token = getToken();
        try {
            const res = await fetch(`${API}/api/customer/deposits/closure-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ depositId, type })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to send OTP.');
            setSuccessMsg(data.message);
            setClosingDeposit({ id: depositId, type });
            setShowOtpModal(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmClosure = async () => {
        if (!otpCode || otpCode.length !== 6) {
            alert('Please enter a valid 6-digit OTP.');
            return;
        }
        setActionLoading(true);
        setError('');
        setSuccessMsg('');
        const token = getToken();
        try {
            const res = await fetch(`${API}/api/customer/deposits/close-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ depositId: closingDeposit.id, type: closingDeposit.type, otpCode })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to submit closure request.');
            setSuccessMsg(data.message);
            setShowOtpModal(false);
            setOtpCode('');
            setClosingDeposit(null);
            fetchDeposits(); // Refresh data
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading && deposits.fixedDeposits.length === 0 && deposits.recurringDeposits.length === 0) {
        return <div className={styles.loadingState}>Loading deposit accounts...</div>;
    }

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Fixed & Recurring Deposits</h1>
                <Link href="/customer/dashboard" className={styles.viewAllLink}>← Back to Dashboard</Link>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}
            {successMsg && <div className={styles.successBanner} style={{ padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', color: '#34D399', border: '1px solid #34D399', borderRadius: '8px', marginBottom: '1rem' }}>{successMsg}</div>}

            {/* FD SECTION */}
            <div className={styles.tableContainer} style={{ marginBottom: '2rem' }}>
                <h2 className={styles.tableTitle}>Fixed Deposits (FD)</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>FD ID</th>
                            <th>PRINCIPAL</th>
                            <th>TODAY'S VALUE</th>
                            <th>INT. RATE</th>
                            <th>START DATE</th>
                            <th>MATURITY</th>
                            <th>PROJECTED</th>
                            <th>STATUS</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deposits.fixedDeposits.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No active Fixed Deposits.</td></tr>
                        ) : deposits.fixedDeposits.map((fd, i) => (
                            <tr key={fd.FD_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{fd.FD_ID}</td>
                                <td>{formatINR(fd.PRINCIPAL_AMOUNT)}</td>
                                <td style={{ color: '#FBBF24', fontWeight: 'bold' }}>{formatINR(fd.CURRENT_VALUE || fd.PRINCIPAL_AMOUNT)}</td>
                                <td style={{ color: '#34D399' }}>{fd.LOCKED_RATE || fd.INTEREST_RATE}%</td>
                                <td>{formatDate(fd.OPENED_AT || fd.OPEN_DATE)}</td>
                                <td>{formatDate(fd.MATURITY_DATE)}</td>
                                <td>{formatINR(fd.PROJECTED_VALUE || fd.MATURITY_AMOUNT)}</td>
                                <td><span className={fd.STATUS === 'ACTIVE' ? styles.statusDone : styles.statusPending}>{fd.STATUS}</span></td>
                                <td>
                                    {fd.STATUS === 'ACTIVE' && (
                                        <button
                                            disabled={actionLoading}
                                            onClick={() => handleInitiateClosure(fd.FD_ID, 'FD')}
                                            style={{ background: 'transparent', border: '1px solid currentColor', color: '#EF4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                        >
                                            Close
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* RD SECTION */}
            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Recurring Deposits (RD)</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>RD ID</th>
                            <th>INSTALMENT</th>
                            <th>TODAY'S VALUE</th>
                            <th>TENURE</th>
                            <th>INTEREST</th>
                            <th>START DATE</th>
                            <th>PROJECTED</th>
                            <th>STATUS</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deposits.recurringDeposits.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No active Recurring Deposits.</td></tr>
                        ) : deposits.recurringDeposits.map((rd, i) => (
                            <tr key={rd.RD_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{rd.RD_ID}</td>
                                <td>{formatINR(rd.MONTHLY_INSTALMENT || rd.INSTALMENT_AMOUNT)}</td>
                                <td style={{ color: '#FBBF24', fontWeight: 'bold' }}>{formatINR(rd.CURRENT_VALUE || rd.CURRENT_BALANCE)}</td>
                                <td>{rd.TENURE_MONTHS} Mo</td>
                                <td style={{ color: '#34D399' }}>{rd.RATE || rd.INTEREST_RATE}%</td>
                                <td>{formatDate(rd.OPENED_AT || rd.OPEN_DATE)}</td>
                                <td>{formatINR(rd.PROJECTED_VALUE)}</td>
                                <td><span className={rd.STATUS === 'ACTIVE' ? styles.statusDone : styles.statusPending}>{rd.STATUS}</span></td>
                                <td>
                                    {rd.STATUS === 'ACTIVE' && (
                                        <button
                                            disabled={actionLoading}
                                            onClick={() => handleInitiateClosure(rd.RD_ID, 'RD')}
                                            style={{ background: 'transparent', border: '1px solid currentColor', color: '#EF4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                        >
                                            Close
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.actionsRow} style={{ marginTop: '2rem' }}>
                <div className={styles.summaryCard} style={{ width: '100%', maxWidth: 'none', background: 'rgba(255,125,0,0.05)', border: '1px dashed #F59E0B' }}>
                    <p style={{ color: '#FBBF24', fontSize: '14px' }}>
                        <strong>Notice:</strong> Competitive interest rates up to 7.5% p.a. for Senior Citizens.
                        Visit the branch to open a new Deposit account today!
                    </p>
                </div>
            </div>

            {showOtpModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#0F172A', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ color: '#fff', marginBottom: '1rem', fontSize: '1.2rem' }}>Verify Deposit Closure</h2>
                        <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            An OTP has been sent to your registered email to authorize the closure of {closingDeposit?.type} {closingDeposit?.id}.
                        </p>
                        <input
                            type="text"
                            placeholder="6-digit OTP"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value)}
                            maxLength={6}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#1E293B', color: '#fff', marginBottom: '1.5rem' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setShowOtpModal(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmClosure}
                                disabled={actionLoading}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                            >
                                {actionLoading ? 'Verifying...' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className={styles.summaryCard} style={{ width: '100%', maxWidth: 'none', background: 'rgba(255,125,0,0.05)', border: '1px dashed #F59E0B' }}>
                <p style={{ color: '#FBBF24', fontSize: '14px' }}>
                    <strong>Notice:</strong> Competitive interest rates up to 7.5% p.a. for Senior Citizens.
                    Visit the branch to open a new Deposit account today!
                </p>
            </div>
        </div>
        // </div>
    );
}
