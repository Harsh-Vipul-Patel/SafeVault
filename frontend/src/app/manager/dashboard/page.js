'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ManagerDashboard() {
    const [kpis, setKpis] = useState({ totalDeposits: 0, totalWithdrawals: 0, pendingApprovals: 0, newAccounts: 0 });
    const [approvalPreview, setApprovalPreview] = useState([]);
    const [liveFeed, setLiveFeed] = useState({ transactions: [], flags: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/dashboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch dashboard data');
            }
            const data = await res.json();
            setKpis(data.kpis || {});
            setApprovalPreview(data.approvalPreview || []);
            setLiveFeed(data.liveFeed || { transactions: [], flags: [] });
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val) => {
        const num = Number(val) || 0;
        if (num >= 100000) return '₹ ' + (num / 100000).toFixed(2) + ' L';
        if (num >= 1000) return '₹ ' + (num / 1000).toFixed(1) + ' K';
        return '₹ ' + num.toLocaleString('en-IN');
    };

    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + ' mins ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' hrs ago';
        return Math.floor(hrs / 24) + ' days ago';
    };

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>Loading dashboard data from Oracle...</div>
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Branch Overview Dashboard</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnPrimary}>EOD SETTLEMENT</button>
                    <button className={styles.btnGhost}>GENERATE REPORT</button>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            {/* KPIS */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>TOTAL DEPOSITS (TODAY)</div>
                        <div className={styles.kpiIcon}>💰</div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpis.totalDeposits)}</div>
                    <div className={styles.kpiTrend}>From Oracle DB</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>TOTAL WITHDRAWALS</div>
                        <div className={styles.kpiIcon}>💸</div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpis.totalWithdrawals)}</div>
                    <div className={styles.kpiTrendDown}>Today's total</div>
                </div>

                <div className={styles.kpiCardAlert}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabelAlert}>PENDING APPROVALS</div>
                        <div className={styles.kpiIcon}>⚖️</div>
                    </div>
                    <div className={styles.kpiValue}>{kpis.pendingApprovals}</div>
                    <div className={styles.kpiTrendAlert}>Awaiting review</div>
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>NEW ACCOUNTS</div>
                        <div className={styles.kpiIcon}>🆕</div>
                    </div>
                    <div className={styles.kpiValue}>{kpis.newAccounts}</div>
                    <div className={styles.kpiTrend}>Opened today</div>
                </div>
            </div>

            <div className={styles.splitGrid}>
                {/* APPROVAL QUEUE PREVIEW */}
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Action Required: Dual Approval Queue</h2>
                        <button className={styles.linkBtn} onClick={() => window.location.href = '/manager/approvals'}>View Full Queue ➔</button>
                    </div>
                    <div className={styles.tableWrap}>
                        <div className={styles.thRow}>
                            <div>REQ. ID</div>
                            <div>OPERATION</div>
                            <div>INITIATOR</div>
                            <div style={{ textAlign: 'right' }}>STATUS</div>
                        </div>

                        {approvalPreview.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>No pending approvals</div>
                        ) : approvalPreview.map((item, i) => (
                            <div className={styles.tdRow} key={i}>
                                <div className={styles.tdId}>{item.QUEUE_ID ? item.QUEUE_ID.substring(0, 8).toUpperCase() : 'N/A'}</div>
                                <div className={styles.tdOp}><span className={styles.opChip}>{item.OPERATION_TYPE || 'N/A'}</span></div>
                                <div>{item.REQUESTED_BY_NAME || 'System'}</div>
                                <div className={styles.tdAmount}>{item.STATUS}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* BRANCH LIVE FEED */}
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Live Branch Activity</h2>
                        <div className={styles.liveIndicator}>LIVE</div>
                    </div>
                    <div className={styles.feedList}>
                        {liveFeed.transactions.length === 0 && liveFeed.flags.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>No recent activity</div>
                        ) : (
                            <>
                                {liveFeed.flags.map((flag, i) => (
                                    <div className={styles.feedItem} key={'f' + i}>
                                        <div className={styles.feedIcon}>⚠️</div>
                                        <div className={styles.feedContent}>
                                            <div className={styles.feedTextAlert}>{flag.FLAG_TYPE} on {flag.ACCOUNT_ID}</div>
                                            <div className={styles.feedTime}>{timeAgo(flag.FLAGGED_AT)}</div>
                                        </div>
                                    </div>
                                ))}
                                {liveFeed.transactions.map((txn, i) => (
                                    <div className={styles.feedItem} key={'t' + i}>
                                        <div className={styles.feedIcon}>✅</div>
                                        <div className={styles.feedContent}>
                                            <div className={styles.feedText}><strong>{txn.INITIATED_BY || 'System'}</strong> {txn.TRANSACTION_TYPE} — {formatCurrency(txn.AMOUNT)} on {txn.ACCOUNT_ID}</div>
                                            <div className={styles.feedTime}>{timeAgo(txn.TRANSACTION_DATE)}</div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
