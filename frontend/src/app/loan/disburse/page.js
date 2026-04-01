'use client';
import { useState, useEffect } from 'react';
import styles from '../loan-pages.module.css';

export default function LoanDisbursement() {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionStatus, setActionStatus] = useState({ id: null, loading: false, message: '' });
    const [errorModalConfig, setErrorModalConfig] = useState(null);

    useEffect(() => {
        fetchApprovedLoans();
    }, []);

    const fetchApprovedLoans = async () => {
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch('http://localhost:5000/api/loan-manager/reports/portfolio', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Filter specifically for APPROVED applications that are not yet disbursed
                const approved = (data.loans || []).filter(l => l.APP_STATUS === 'APPROVED' && l.ACCOUNT_STATUS !== 'ACTIVE');
                setLoans(approved);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDisburse = async (appId, requestedAmount) => {
        setActionStatus({ id: appId, loading: true, message: '' });
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`http://localhost:5000/api/loan-manager/disburse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ loanAppId: appId })
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.message && data.message.includes('not in APPROVED state')) {
                    setErrorModalConfig({ type: 'NOT_APPROVED_STATE' });
                    setActionStatus({ id: null });
                    return;
                }
                throw new Error(data.message);
            }

            // Check if it required dual approval
            let msg = 'Disbursed successfully';
            if (requestedAmount > 500000) {
                msg = 'Sent to Dual Approval Queue (>₹5L)';
            }

            setActionStatus({ id: appId, loading: false, message: msg });
            setTimeout(() => {
                setActionStatus({ id: null });
                fetchApprovedLoans(); // Refresh list to remove it
            }, 3000);
        } catch (err) {
            setActionStatus({ id: appId, loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setActionStatus({ id: null }), 5000);
        }
    };

    if (loading) return <div style={{ color: 'var(--cream)' }}>Loading approved loans...</div>;

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Loan Disbursements</h1>
                    <p className={styles.pageSubtitle}>Process disbursement for approved loans. High amounts escalate automatically.</p>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>App ID</th>
                                <th>Customer</th>
                                <th>Loan Type</th>
                                <th>Amount to Disburse</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map((l) => (
                                <tr key={l.LOAN_APP_ID}>
                                    <td style={{ fontFamily: 'monospace' }}>APP-{l.LOAN_APP_ID.substring(0, 6)}</td>
                                    <td>{l.CUSTOMER_NAME}</td>
                                    <td>{l.LOAN_TYPE}</td>
                                    <td>
                                        <div style={{ color: 'var(--gold2)', fontWeight: 600 }}>
                                            ₹{l.OUTSTANDING_PRINCIPAL?.toLocaleString('en-IN')}
                                        </div>
                                        {l.OUTSTANDING_PRINCIPAL > 500000 && (
                                            <div style={{ fontSize: '11px', color: '#FF9800', marginTop: '4px' }}>
                                                Requires branch manager approval
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <button
                                                onClick={() => handleDisburse(l.LOAN_APP_ID, l.OUTSTANDING_PRINCIPAL)}
                                                className={styles.submitBtn}
                                                style={{ padding: '8px 16px', fontSize: '12px' }}
                                                disabled={actionStatus.id === l.LOAN_APP_ID && actionStatus.loading}
                                            >
                                                {actionStatus.id === l.LOAN_APP_ID && actionStatus.loading ? 'Processing...' : 'Disburse Funds'}
                                            </button>

                                            {actionStatus.id === l.LOAN_APP_ID && !actionStatus.loading && (
                                                <span style={{ fontSize: '12px', color: actionStatus.message.includes('Error') ? '#F44336' : '#4CAF50' }}>
                                                    {actionStatus.message}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {loans.length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>No pre-disbursement loans pending.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {errorModalConfig && errorModalConfig.type === 'NOT_APPROVED_STATE' && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1E293B', padding: '32px', width: '400px', borderRadius: '12px', color: '#F8FAFC', borderTop: '4px solid #EF4444' }}>
                        <h3 style={{ marginBottom: '16px', color: '#EF4444', margin: '0 0 16px 0', fontSize: '18px' }}>Disbursement Failed</h3>
                        <p style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '8px' }}>
                            Loan is not in APPROVED state.
                        </p>
                        <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '16px' }}>
                            Current Status: <span style={{ color: '#F59E0B', fontWeight: 600 }}>UNDER_REVIEW</span>
                        </p>
                        <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px' }}>
                            The loan must be reviewed and approved before disbursement.
                        </p>
                        <button 
                            onClick={() => setErrorModalConfig(null)} 
                            style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            Go to Loan Review
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
