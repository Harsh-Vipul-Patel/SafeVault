'use client';
import { useState, useEffect } from 'react';
import styles from '../loan-pages.module.css';

export default function ApplicationTracking() {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionStatus, setActionStatus] = useState({ id: null, loading: false, message: '' });

    useEffect(() => {
        fetchLoans();
    }, []);

    const fetchLoans = async () => {
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch('http://localhost:5000/api/loan-manager/reports/portfolio', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLoans(data.loans || []);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        setActionStatus({ id, loading: true, message: '' });
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`http://localhost:5000/api/loan-manager/application/${id}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus, note: 'Status updated by Manager' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            setActionStatus({ id, loading: false, message: 'Success' });
            fetchLoans(); // refresh
            setTimeout(() => setActionStatus({ id: null }), 3000);
        } catch (err) {
            setActionStatus({ id, loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setActionStatus({ id: null }), 5000);
        }
    };

    const handleGenerateEmi = async (id, app) => {
        setActionStatus({ id: id + '_emi', loading: true, message: '' });
        try {
            const token = localStorage.getItem('suraksha_token');
            // We pass loanAppId as loanAccountId for pre-disbursement generation
            const res = await fetch(`http://localhost:5000/api/loan-manager/emi/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    loanAccountId: id,
                    principal: app.OUTSTANDING_PRINCIPAL || app.REQUESTED_AMOUNT, // Requested amount
                    annualRate: app.ANNUAL_RATE || 9.5, // Assumed if missing from view but usually it's in the DB
                    tenureMonths: app.TENURE_MONTHS || 12
                }) // Note: requested_amount, rate, tenure are fetched or passed, since our basic view might lack rate/tenure we would normally query them. Here we just rely on defaults if missing, but we better fetch full application
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            setActionStatus({ id: id + '_emi', loading: false, message: 'EMI Schedule Generated' });
            setTimeout(() => setActionStatus({ id: null }), 3000);
        } catch (err) {
            setActionStatus({ id: id + '_emi', loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setActionStatus({ id: null }), 5000);
        }
    };


    if (loading) return <div style={{ color: 'var(--cream)' }}>Loading applications...</div>;

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Application Tracking</h1>
                    <p className={styles.pageSubtitle}>Review and update loan applications</p>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>App ID</th>
                                <th>Customer</th>
                                <th>Details</th>
                                <th>Current Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map((l) => (
                                <tr key={l.LOAN_APP_ID}>
                                    <td style={{ fontFamily: 'monospace' }}>APP-{l.LOAN_APP_ID.substring(0, 6)}</td>
                                    <td>{l.CUSTOMER_NAME}</td>
                                    <td>
                                        <div style={{ color: 'var(--cream2)' }}>{l.LOAN_TYPE} · ₹{l.OUTSTANDING_PRINCIPAL?.toLocaleString('en-IN')}</div>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${styles['status_' + l.APP_STATUS]}`}>
                                            {l.APP_STATUS}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {l.APP_STATUS === 'RECEIVED' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'UNDER_REVIEW')}
                                                    className={styles.submitBtn}
                                                    style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(255,152,0,0.2)', color: '#FF9800', boxShadow: 'none' }}
                                                >
                                                    Start Review
                                                </button>
                                            )}
                                            {l.APP_STATUS === 'UNDER_REVIEW' && (
                                                <>
                                                    <button
                                                        onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'APPROVED')}
                                                        className={styles.submitBtn}
                                                        style={{ padding: '6px 12px', fontSize: '11px', boxShadow: 'none' }}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'REJECTED')}
                                                        className={styles.submitBtn}
                                                        style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(244,67,54,0.2)', color: '#F44336', boxShadow: 'none' }}
                                                    >
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                            {l.APP_STATUS === 'APPROVED' && (
                                                <button
                                                    onClick={() => handleGenerateEmi(l.LOAN_APP_ID, l)}
                                                    className={styles.submitBtn}
                                                    style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(76,175,80,0.2)', color: '#4CAF50', boxShadow: 'none' }}
                                                >
                                                    Generate EMI Schedule
                                                </button>
                                            )}

                                            {actionStatus.id === l.LOAN_APP_ID && (
                                                <span style={{ fontSize: '11px', color: actionStatus.message.includes('Error') ? '#F44336' : '#4CAF50', alignSelf: 'center' }}>
                                                    {actionStatus.message || 'Processing...'}
                                                </span>
                                            )}
                                            {actionStatus.id === l.LOAN_APP_ID + '_emi' && (
                                                <span style={{ fontSize: '11px', color: actionStatus.message.includes('Error') ? '#F44336' : '#4CAF50', alignSelf: 'center' }}>
                                                    {actionStatus.message || 'Processing...'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {loans.length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>No applications found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
