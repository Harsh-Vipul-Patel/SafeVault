'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
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

    useEffect(() => {
        const token = getToken();
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
    }, []);

    if (loading) return <div className={styles.loadingState}>Loading deposit accounts...</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Fixed & Recurring Deposits</h1>
                <Link href="/customer/dashboard" className={styles.viewAllLink}>← Back to Dashboard</Link>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* FD SECTION */}
            <div className={styles.tableContainer} style={{ marginBottom: '2rem' }}>
                <h2 className={styles.tableTitle}>Fixed Deposits (FD)</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>FD ID</th>
                            <th>PRINCIPAL</th>
                            <th>INT. RATE</th>
                            <th>START DATE</th>
                            <th>MATURITY</th>
                            <th>PROJECTED</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deposits.fixedDeposits.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No active Fixed Deposits.</td></tr>
                        ) : deposits.fixedDeposits.map((fd, i) => (
                            <tr key={fd.FD_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{fd.FD_ID}</td>
                                <td>{formatINR(fd.PRINCIPAL_AMOUNT)}</td>
                                <td style={{ color: '#34D399' }}>{fd.INTEREST_RATE}%</td>
                                <td>{formatDate(fd.OPEN_DATE)}</td>
                                <td>{formatDate(fd.MATURITY_DATE)}</td>
                                <td>{formatINR(fd.MATURITY_AMOUNT)}</td>
                                <td><span className={styles.statusDone}>{fd.STATUS}</span></td>
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
                            <th>BALANCE</th>
                            <th>TENURE</th>
                            <th>INTEREST</th>
                            <th>START DATE</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deposits.recurringDeposits.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No active Recurring Deposits.</td></tr>
                        ) : deposits.recurringDeposits.map((rd, i) => (
                            <tr key={rd.RD_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{rd.RD_ID}</td>
                                <td>{formatINR(rd.INSTALMENT_AMOUNT)}</td>
                                <td>{formatINR(rd.CURRENT_BALANCE)}</td>
                                <td>{rd.TENURE_MONTHS} Mo</td>
                                <td style={{ color: '#34D399' }}>{rd.INTEREST_RATE}%</td>
                                <td>{formatDate(rd.OPEN_DATE)}</td>
                                <td><span className={styles.statusDone}>{rd.STATUS}</span></td>
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
        </div>
    );
}
