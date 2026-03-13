'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Wallet,
    CreditCard,
    ArrowUpRight,
    ArrowDownLeft,
    History,
    RefreshCcw,
    FileText,
    User as UserIcon,
    ChevronRight,
    TrendingUp
} from 'lucide-react';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function decodeJWT(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch { return null; }
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerDashboard() {
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [userName, setUserName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = getToken();
        if (token) {
            const payload = decodeJWT(token);
            if (payload?.name) setUserName(payload.name);
            else if (payload?.username) setUserName(payload.username);
        }

        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch(`${API}/api/customer/accounts`, { headers }).then(r => r.json()),
            fetch(`${API}/api/customer/transactions`, { headers }).then(r => r.json())
        ])
            .then(([accData, txnData]) => {
                setAccounts(accData.accounts || []);
                setTransactions(txnData.transactions || []);
                setLoading(false);
            })
            .catch(() => {
                setError('Could not connect to the server. Please check your connection.');
                setLoading(false);
            });
    }, []);

    const savings = accounts.find(a => (a.TYPE_NAME || a.type_name || '').toLowerCase().includes('saving'));
    const current = accounts.find(a => (a.TYPE_NAME || a.type_name || '').toLowerCase().includes('current'));
    const latestTxn = transactions[0];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ repeat: Infinity, duration: 1, repeatType: 'reverse' }}
                    >
                        Loading your secure vault data…
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className={styles.dashboard}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <motion.div className={styles.headerRow} variants={itemVariants}>
                <h1 className={`${styles.greeting} text-gradient-gold`}>
                    Welcome back, {userName || 'Customer'}
                </h1>
                <div className={styles.dateStamp}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </motion.div>

            {error && <motion.div className={styles.errorBanner} variants={itemVariants}>{error}</motion.div>}

            {/* TOP CARDS ROW */}
            <motion.div className={styles.cardsRow} variants={containerVariants}>
                {/* Savings Card */}
                <motion.div className={`${styles.summaryCard} pearl-card`} variants={itemVariants}>
                    <div className={styles.cardHeader}>
                        <div className={styles.iconCircle}><Wallet size={20} /></div>
                        <TrendingUp size={16} className={styles.trendIcon} />
                    </div>
                    {savings ? (
                        <>
                            <div className={styles.cardLabel}>
                                {savings.TYPE_NAME || savings.type_name || 'SAVINGS ACCOUNT'}
                            </div>
                            <div className={styles.cardAmount}>
                                {formatINR(savings.BALANCE || savings.balance)}
                            </div>
                            <div className={styles.cardDetail}>
                                {savings.ACCOUNT_ID || savings.account_id}
                                <span className={styles.statusBadge}>
                                    {savings.STATUS || savings.status}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.cardLabel}>SAVINGS BALANCE</div>
                            <div className={styles.cardAmount}>—</div>
                            <div className={styles.cardDetail}>No savings account</div>
                        </>
                    )}
                </motion.div>

                {/* Current Card */}
                <motion.div className={`${styles.summaryCard} pearl-card`} variants={itemVariants}>
                    <div className={styles.cardHeader}>
                        <div className={styles.iconCircle}><CreditCard size={20} /></div>
                    </div>
                    {current ? (
                        <>
                            <div className={styles.cardLabel}>
                                {current.TYPE_NAME || current.type_name || 'CURRENT ACCOUNT'}
                            </div>
                            <div className={styles.cardAmount}>
                                {formatINR(current.BALANCE || current.balance)}
                            </div>
                            <div className={styles.cardDetail}>
                                {current.ACCOUNT_ID || current.account_id}
                            </div>
                        </>
                    ) : accounts[1] ? (
                        <>
                            <div className={styles.cardLabel}>
                                {accounts[1].TYPE_NAME || accounts[1].type_name}
                            </div>
                            <div className={styles.cardAmount}>
                                {formatINR(accounts[1].BALANCE || accounts[1].balance)}
                            </div>
                            <div className={styles.cardDetail}>
                                {accounts[1].ACCOUNT_ID || accounts[1].account_id}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.cardLabel}>CURRENT ACCOUNT</div>
                            <div className={styles.cardAmount}>—</div>
                            <div className={styles.cardDetail}>No current account</div>
                        </>
                    )}
                </motion.div>

                {/* Last Transaction Card */}
                <motion.div className={`${styles.summaryCard} pearl-card`} variants={itemVariants}>
                    <div className={styles.cardHeader}>
                        <div className={styles.iconCircle}><History size={20} /></div>
                    </div>
                    <div className={styles.cardLabel}>LAST TRANSACTION</div>
                    {latestTxn ? (
                        <>
                            <div className={
                                (latestTxn.TRANSACTION_TYPE || latestTxn.transaction_type || '').includes('CREDIT')
                                    ? styles.cardAmountGreen : styles.cardAmountRed
                            }>
                                {(latestTxn.TRANSACTION_TYPE || latestTxn.transaction_type || '').includes('CREDIT') ? (
                                    <ArrowUpRight size={24} />
                                ) : (
                                    <ArrowDownLeft size={24} />
                                )}
                                {formatINR(latestTxn.AMOUNT || latestTxn.amount)}
                            </div>
                            <div className={styles.cardDetail}>
                                {formatDate(latestTxn.TRANSACTION_DATE || latestTxn.transaction_date)}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.cardAmount}>—</div>
                            <div className={styles.cardDetail}>No transactions yet</div>
                        </>
                    )}
                </motion.div>
            </motion.div>

            {/* TRANSACTIONS TABLE */}
            <motion.div className={`${styles.tableContainer} glass-surface`} variants={itemVariants}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.tableTitle}>Recent Transactions</h2>
                    <Link href="/customer/statements" className={styles.viewAllLink}>
                        View All <ChevronRight size={16} />
                    </Link>
                </div>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>DATE</th>
                            <th>DESCRIPTION</th>
                            <th>ACCOUNT</th>
                            <th>AMOUNT</th>
                            <th>BALANCE</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                                    No transactions found in this period.
                                </td>
                            </tr>
                        ) : transactions.slice(0, 5).map((t, i) => {
                            const type = t.TRANSACTION_TYPE || t.transaction_type || '';
                            const isCredit = type.includes('CREDIT') || type.includes('DEPOSIT');
                            const amt = t.AMOUNT || t.amount;
                            const bal = t.BALANCE_AFTER || t.balance_after;
                            return (
                                <motion.tr
                                    key={t.TRANSACTION_ID || t.transaction_id || i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <td>{formatDate(t.TRANSACTION_DATE || t.transaction_date)}</td>
                                    <td className={styles.txnDesc}>{t.DESCRIPTION || t.description || type}</td>
                                    <td style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>
                                        {t.ACCOUNT_ID || t.account_id}
                                    </td>
                                    <td className={isCredit ? styles.amtPositive : styles.amtNegative}>
                                        {isCredit ? '+' : '-'}{formatINR(amt)}
                                    </td>
                                    <td style={{ fontFamily: 'DM Mono', fontSize: '13px' }}>
                                        {formatINR(bal)}
                                    </td>
                                    <td>
                                        <span className={styles.statusDone}>Completed</span>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </motion.div>

            {/* ACTIONS ROW */}
            <motion.div className={styles.actionsRow} variants={containerVariants}>
                <motion.div variants={itemVariants} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link href="/customer/internal" className={styles.btnPrimary}>
                        <RefreshCcw size={18} /> New Transfer
                    </Link>
                </motion.div>
                <motion.div variants={itemVariants} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link href="/customer/statements" className={styles.btnSecondary}>
                        <FileText size={18} /> View Statements
                    </Link>
                </motion.div>
                <motion.div variants={itemVariants} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link href="/customer/accounts" className={styles.btnSecondary}>
                        <CreditCard size={18} /> My Accounts
                    </Link>
                </motion.div>
            </motion.div>
        </motion.div>
    );
}
