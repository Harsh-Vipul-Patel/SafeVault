'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp,
    FileText,
    Clock,
    IndianRupee,
    PieChart,
    Users,
    ArrowUpRight,
    CheckCircle,
    Layers,
    Briefcase,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
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

    if (loading) return (
        <div className={styles.loadingContainer}>
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className={styles.loanLoader}
            >
                <PieChart size={40} color="#4CAF50" />
            </motion.div>
            <p>Aggregating Portfolio Data...</p>
        </div>
    );

    if (error) return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.errorState}>
            <AlertCircle size={24} />
            <p>System Error: {error}</p>
        </motion.div>
    );

    const kpis = data.kpis || {};
    const emis = data.emisDueToday || {};
    const loans = data.loans || [];

    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <motion.div variants={itemVariants} className={styles.pageHeader}>
                <div className={styles.titleGroup}>
                    <h1 className={`${styles.pageTitle} text-gradient-gold`}>Portfolio Intelligence</h1>
                    <p className={styles.pageSubtitle}>Structural Capital & Asset Performance Management</p>
                </div>
                <div className={styles.headerActions}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={styles.btnSync}>
                        <RefreshCw size={14} /> LIVE RECALC
                    </motion.button>
                </div>
            </motion.div>

            <div className={styles.kpiGrid}>
                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>ACTIVE POOL</div>
                        <Briefcase size={16} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{kpis.ACTIVE_LOANS_COUNT || 0}</div>
                    <div className={styles.kpiSub}>
                        Market Value: <span className={styles.textGold}>₹{(kpis.ACTIVE_LOANS_VALUE || 0).toLocaleString('en-IN')}</span>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card ${styles.kpiAlert}`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>ASSET REVIEW</div>
                        <Layers size={16} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{kpis.PENDING_REVIEW_COUNT || 0}</div>
                    <div className={`${styles.kpiSub} ${styles.textWarning}`}>
                        <Clock size={12} /> Awaiting Approval
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.kpiCard} pearl-card`}>
                    <div className={styles.kpiHeader}>
                        <div className={styles.kpiLabel}>EXPECTED INFLOW</div>
                        <TrendingUp size={16} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{emis.count || 0} <span className={styles.unit}>Due</span></div>
                    <div className={styles.kpiSub}>
                        Projection: <span className={styles.textGreen}>₹{(emis.total || 0).toLocaleString('en-IN')}</span>
                    </div>
                </motion.div>
            </div>

            <motion.div variants={itemVariants} className={`${styles.section} glass-surface`}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Strategic Lending Activity</h2>
                    <div className={styles.activePill}>LIVE FEED</div>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>Borrower / Entity</th>
                                <th>Asset Class</th>
                                <th>Principal</th>
                                <th>Lifecycle Stage</th>
                                <th>Control Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {loans.slice(0, 10).map((l, i) => (
                                    <motion.tr
                                        key={l.LOAN_APP_ID}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <td>
                                            <div className={styles.customerName}>{l.CUSTOMER_NAME}</div>
                                            <div className={styles.appId}>ID: APP-{l.LOAN_APP_ID.substring(0, 6)}</div>
                                        </td>
                                        <td><div className={styles.loanTypeBadge}>{l.LOAN_TYPE}</div></td>
                                        <td className={styles.amountCell}>₹{l.OUTSTANDING_PRINCIPAL?.toLocaleString('en-IN')}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${styles['status_' + l.APP_STATUS]}`}>
                                                {l.APP_STATUS}
                                            </span>
                                        </td>
                                        <td>
                                            {l.LOAN_ACCOUNT_ID ? (
                                                <div className={styles.accountControl}>
                                                    <span className={styles.accId}>{l.LOAN_ACCOUNT_ID}</span>
                                                    <span className={`${styles.statusBadgeSmall} ${styles['status_' + l.ACCOUNT_STATUS]}`}>
                                                        {l.ACCOUNT_STATUS}
                                                    </span>
                                                </div>
                                            ) : <span className={styles.notDisbursed}>UNASSIGNED</span>}
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                            {loans.length === 0 && (
                                <tr><td colSpan="5" className={styles.emptyTable}>No active instruments detected in the lending pool.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
}
