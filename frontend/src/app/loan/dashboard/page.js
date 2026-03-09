'use client';
import { useState, useEffect } from 'react';
import styles from '../loan-pages.module.css';

export default function LoanDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const token = localStorage.getItem('suraksha_token');
                const res = await fetch('http://localhost:5000/api/loan-manager/reports/portfolio', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Failed to fetch data');
                }
                const json = await res.json();
                setData(json);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, []);

    if (loading) return <div style={{ color: 'var(--cream)' }}>Loading portfolio...</div>;
    if (error) return <div style={{ color: '#ff6b6b' }}>Error: {error}</div>;

    const kpis = data.kpis || {};
    const emis = data.emisDueToday || {};
    const loans = data.loans || [];

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Portfolio Dashboard</h1>
                    <p className={styles.pageSubtitle}>Overview of lending operations and branch performance</p>
                </div>
            </div>

            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Active Loans</div>
                    <div className={styles.kpiValue}>{kpis.ACTIVE_LOANS_COUNT || 0}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px' }}>
                        Total Value: ₹{(kpis.ACTIVE_LOANS_VALUE || 0).toLocaleString('en-IN')}
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Pending Applications</div>
                    <div className={styles.kpiValue}>{kpis.PENDING_REVIEW_COUNT || 0}</div>
                    <div style={{ color: '#FF9800', fontSize: '13px', marginTop: '8px' }}>
                        Requires Action
                    </div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>EMIs Due Today</div>
                    <div className={styles.kpiValue}>{emis.count || 0}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px' }}>
                        Expected: ₹{(emis.total || 0).toLocaleString('en-IN')}
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Recent Loan Activity</h2>
                <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>Applicant</th>
                                <th>Loan Type</th>
                                <th>Amount</th>
                                <th>App Status</th>
                                <th>Account ID / Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.slice(0, 10).map((l, i) => (
                                <tr key={i}>
                                    <td>
                                        <div style={{ fontWeight: 500, color: 'var(--cream)' }}>{l.CUSTOMER_NAME}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>APP-{l.LOAN_APP_ID.substring(0, 6)}...</div>
                                    </td>
                                    <td>{l.LOAN_TYPE}</td>
                                    <td>₹{l.OUTSTANDING_PRINCIPAL?.toLocaleString('en-IN')}</td>
                                    <td><span className={`${styles.statusBadge} ${styles['status_' + l.APP_STATUS]}`}>{l.APP_STATUS}</span></td>
                                    <td>
                                        {l.LOAN_ACCOUNT_ID ? (
                                            <>
                                                <div>{l.LOAN_ACCOUNT_ID}</div>
                                                <span className={`${styles.statusBadge} ${styles['status_' + l.ACCOUNT_STATUS]}`} style={{ marginTop: 4 }}>
                                                    {l.ACCOUNT_STATUS}
                                                </span>
                                            </>
                                        ) : <span style={{ color: 'var(--muted)' }}>Not Disbursed</span>}
                                    </td>
                                </tr>
                            ))}
                            {loans.length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>No recent loans found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
