'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp,
    TrendingDown,
    ShieldCheck,
    UserPlus,
    Activity,
    AlertTriangle,
    CheckCircle,
    ArrowRight,
    Download,
    Calendar,
    Wallet,
    Scale,
    Handshake
} from 'lucide-react';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ManagerDashboard() {
    const [kpis, setKpis] = useState({ totalDeposits: 0, totalWithdrawals: 0, pendingApprovals: 0, pendingSettlements: 0, newAccounts: 0 });
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
        if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
        if (num >= 1000) return '₹' + (num / 1000).toFixed(1) + ' K';
        return '₹' + num.toLocaleString('en-IN');
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

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
    };

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className={styles.loader}
                />
                <p>Establishing Secure Link to Oracle Node...</p>
            </div>
        );
    }

    return (
        <motion.div
            className={styles.dashboard}
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <motion.header variants={itemVariants} className={styles.header}>
                <div className={styles.titleGroup}>
                    <h1 className={`${styles.greeting} text-gradient-gold`}>Branch Oversight</h1>
                    <p className={styles.headerSub}>Admin Node: Mumbai Vault (003) · Integrity Level: ALPHA</p>
                </div>
                <div className={styles.headerActions}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={styles.btnPrimary}>
                        <ShieldCheck size={16} /> EOD SETTLEMENT
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={styles.btnGhost}>
                        <Download size={16} /> EXPORT AUDIT
                    </motion.button>
                </div>
            </motion.header>

            {error && <motion.div variants={itemVariants} className={styles.errorBanner}>{error}</motion.div>}

            {/* KPIS */}
            <div className={styles.kpiGrid}>
                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>TOTAL DEPOSITS (TODAY)</div>
                        <div className={styles.kpiIcon}><Wallet size={18} /></div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpis.totalDeposits)}</div>
                    <div className={styles.kpiTrend}><TrendingUp size={12} /> Live Oracle Sync</div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>TOTAL WITHDRAWALS</div>
                        <div className={styles.kpiIcon}><TrendingDown size={18} /></div>
                    </div>
                    <div className={styles.kpiValue}>{formatCurrency(kpis.totalWithdrawals)}</div>
                    <div className={styles.kpiTrendNeutral}><Calendar size={12} /> Today&apos;s cycle</div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCardAlert} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabelAlert}>PENDING APPROVALS</div>
                        <div className={styles.kpiIconAlert}><Scale size={18} /></div>
                    </div>
                    <div className={styles.kpiValue}>{kpis.pendingApprovals}</div>
                    <div className={styles.kpiTrendAlert}><Activity size={12} /> Awaiting Dual-Auth</div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCardAlert} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabelAlert}>PENDING SETTLEMENTS</div>
                        <div className={styles.kpiIconAlert}><Handshake size={18} /></div>
                    </div>
                    <div className={styles.kpiValue}>{kpis.pendingSettlements}</div>
                    <div className={styles.kpiTrendAlert}><Activity size={12} /> External Transfers</div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>NEW ACCOUNTS</div>
                        <div className={styles.kpiIcon}><UserPlus size={18} /></div>
                    </div>
                    <div className={styles.kpiValue}>{kpis.newAccounts}</div>
                    <div className={styles.kpiTrend}><CheckCircle size={12} /> Growth target met</div>
                </motion.div>
            </div>

            <div className={styles.splitGrid}>
                {/* APPROVAL QUEUE PREVIEW */}
                <motion.div variants={itemVariants} className={`${styles.panel} glass-surface`}>
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitleGroup}>
                            <Scale size={18} />
                            <h2 className={styles.panelTitle}>Dual Approval Queue</h2>
                        </div>
                        <button className={styles.linkBtn} onClick={() => window.location.href = '/manager/approvals'}>
                            Review Full Queue <ArrowRight size={14} />
                        </button>
                    </div>
                    <div className={styles.tableWrap}>
                        <div className={styles.thRow}>
                            <div>REQ. ID</div>
                            <div>OPERATION</div>
                            <div>INITIATOR</div>
                            <div style={{ textAlign: 'right' }}>STATUS</div>
                        </div>

                        <div className={styles.tableBody}>
                            {approvalPreview.length === 0 ? (
                                <div className={styles.emptyState}>No pending approvals</div>
                            ) : (
                                <AnimatePresence>
                                    {approvalPreview.map((item, i) => (
                                        <motion.div
                                            className={styles.tdRow}
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                        >
                                            <div className={styles.tdId}>{item.QUEUE_ID ? item.QUEUE_ID.substring(0, 8).toUpperCase() : 'N/A'}</div>
                                            <div className={styles.tdOp}><span className={styles.opChip}>{item.OPERATION_TYPE || 'N/A'}</span></div>
                                            <div className={styles.tdOwner}>{item.REQUESTED_BY_NAME || 'System'}</div>
                                            <div className={styles.tdStatus}>{item.STATUS}</div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* BRANCH LIVE FEED */}
                <motion.div variants={itemVariants} className={`${styles.panel} glass-surface`}>
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitleGroup}>
                            <Activity size={18} />
                            <h2 className={styles.panelTitle}>Live Feed</h2>
                        </div>
                        <div className={styles.liveIndicator}>LIVE</div>
                    </div>
                    <div className={styles.feedList}>
                        {liveFeed.transactions.length === 0 && liveFeed.flags.length === 0 ? (
                            <div className={styles.emptyState}>No recent activity</div>
                        ) : (
                            <AnimatePresence>
                                {liveFeed.flags.map((flag, i) => (
                                    <motion.div
                                        className={styles.feedItem}
                                        key={'f' + i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <div className={styles.feedIconAlert}><AlertTriangle size={16} /></div>
                                        <div className={styles.feedContent}>
                                            <div className={styles.feedTextAlert}>{flag.FLAG_TYPE} on {flag.ACCOUNT_ID}</div>
                                            <div className={styles.feedTime}>{timeAgo(flag.FLAGGED_AT)}</div>
                                        </div>
                                    </motion.div>
                                ))}
                                {liveFeed.transactions.map((txn, i) => (
                                    <motion.div
                                        className={styles.feedItem}
                                        key={'t' + i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <div className={styles.feedIcon}><CheckCircle size={16} /></div>
                                        <div className={styles.feedContent}>
                                            <div className={styles.feedText}>
                                                <strong>{txn.INITIATED_BY || 'System'}</strong> {txn.TRANSACTION_TYPE}
                                                <span className={styles.feedAmount}> {formatCurrency(txn.AMOUNT)}</span>
                                            </div>
                                            <div className={styles.feedTime}>{timeAgo(txn.TRANSACTION_DATE)}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
