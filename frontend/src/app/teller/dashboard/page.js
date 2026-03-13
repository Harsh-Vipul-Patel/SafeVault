'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    Zap,
    ArrowUpCircle,
    ArrowDownCircle,
    Plus,
    RefreshCcw,
    CheckCircle2,
    Clock,
    UserPlus,
    Search,
    Banknote,
    HandHelping,
    UserCheck
} from 'lucide-react';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function TellerDashboard() {
    const [queue, setQueue] = useState([]);
    const [stats, setStats] = useState({ queueLen: 0, txnToday: 0, totalDeposits: 0, totalWithdrawals: 0 });
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [servedMsg, setServedMsg] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    // --- Add to Queue modal ---
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState('');
    const [newService, setNewService] = useState('Cash Deposit');
    const [newPriority, setNewPriority] = useState(2);
    const [addLoading, setAddLoading] = useState(false);

    const fetchQueue = async () => {
        try {
            const res = await fetch(`${API}/api/teller/queue`, { headers: { Authorization: `Bearer ${getToken()}` } });
            const data = await res.json();
            setQueue(data.queue || []);
            setStats(s => ({ ...s, queueLen: (data.queue || []).length }));
        } catch {
            setQueue([]);
            setStats(s => ({ ...s, queueLen: 0 }));
        }
        setLoadingQueue(false);
    };

    const fetchStats = async () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const res = await fetch(`${API}/api/teller/daily-report?date=${today}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok && data.summary) {
                setStats(s => ({
                    ...s,
                    txnToday: data.summary.txnCount,
                    totalDeposits: data.summary.totalDeposits,
                    totalWithdrawals: data.summary.totalWithdrawals
                }));
            }
        } catch { }
    };

    useEffect(() => {
        fetchQueue();
        fetchStats();
        const interval = setInterval(() => { fetchQueue(); fetchStats(); }, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleServe = async (queueId, tokenNumber) => {
        setActionLoading(queueId);
        try {
            const res = await fetch(`${API}/api/teller/serve-queue/${queueId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                setServedMsg(`Token ${tokenNumber} marked as Served.`);
                setTimeout(() => setServedMsg(null), 3000);
                await fetchQueue();
            } else {
                const data = await res.json();
                setServedMsg(data.message || 'Failed to serve.');
                setTimeout(() => setServedMsg(null), 3000);
            }
        } catch {
            setServedMsg('Network error. Is the backend running?');
            setTimeout(() => setServedMsg(null), 3000);
        }
        setActionLoading(null);
    };

    const handleAddToQueue = async () => {
        if (!newCustomer.trim()) return;
        setAddLoading(true);
        try {
            const res = await fetch(`${API}/api/teller/submit-queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ customerName: newCustomer, serviceType: newService, priority: newPriority })
            });
            if (res.ok) {
                setShowAddModal(false);
                setNewCustomer('');
                setNewService('Cash Deposit');
                setNewPriority(2);
                await fetchQueue();
            }
        } catch { }
        setAddLoading(false);
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

    return (
        <motion.div
            className={styles.page}
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <motion.div variants={itemVariants} className={styles.header}>
                <h1 className={`${styles.pageTitle} text-gradient-gold`}>Counter Operations</h1>
                <p className={styles.subtitle}>Mumbai Central · Counter 04 · Branch 003</p>
            </motion.div>

            <AnimatePresence>
                {servedMsg && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className={styles.alert}
                    >
                        <CheckCircle2 size={18} /> {servedMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* STATS ROW */}
            <motion.div variants={itemVariants} className={styles.statsRow}>
                <div className={`${styles.statCard} pearl-card`}>
                    <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                        <Users size={20} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>QUEUE LENGTH</div>
                        <div className={styles.statValue}>{stats.queueLen}</div>
                        <div className={styles.statSub}>Customers waiting</div>
                    </div>
                </div>
                <div className={`${styles.statCard} pearl-card`}>
                    <div className={styles.statIcon} style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#EAB308' }}>
                        <Zap size={20} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>TODAY&apos;S TXNS</div>
                        <div className={styles.statValue}>{stats.txnToday}</div>
                        <div className={styles.statSub}>Live processing</div>
                    </div>
                </div>
                <div className={`${styles.statCard} pearl-card`}>
                    <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                        <ArrowUpCircle size={20} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>TOTAL DEPOSITS</div>
                        <div className={`${styles.statValue} ${styles.greenValue}`}>
                            {formatINR(stats.totalDeposits)}
                        </div>
                        <div className={styles.statSub}>Credits processed</div>
                    </div>
                </div>
                <div className={`${styles.statCard} pearl-card`}>
                    <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                        <ArrowDownCircle size={20} />
                    </div>
                    <div className={styles.statContent}>
                        <div className={styles.statLabel}>WITHDRAWALS</div>
                        <div className={`${styles.statValue} ${styles.redValue}`}>
                            {formatINR(stats.totalWithdrawals)}
                        </div>
                        <div className={styles.statSub}>Debits processed</div>
                    </div>
                </div>
            </motion.div>

            {/* QUEUE TABLE */}
            <motion.div variants={itemVariants} className={`${styles.queueCard} glass-surface`}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>
                        <Clock size={16} />
                        <span>Service Queue {loadingQueue ? '(Loading…)' : `(${queue.length})`}</span>
                    </div>
                    <div className={styles.cardActions}>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowAddModal(true)}
                            className={styles.btnAdd}
                        >
                            <Plus size={16} /> Add Customer
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ rotate: 180 }}
                            onClick={fetchQueue}
                            className={styles.btnRefresh}
                        >
                            <RefreshCcw size={16} />
                        </motion.button>
                    </div>
                </div>
                <div className={styles.tableWrapper}>
                    <table className={styles.queueTable}>
                        <thead>
                            <tr>
                                <th>TOKEN</th>
                                <th>CUSTOMER</th>
                                <th>SERVICE</th>
                                <th>PRIORITY</th>
                                <th>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {queue.length === 0 ? (
                                    <motion.tr
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <td colSpan={5} className={styles.emptyCell}>
                                            <div className={styles.emptyState}>
                                                <UserPlus size={40} className={styles.emptyIcon} />
                                                <p>No customers in queue.</p>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ) : queue.map((row, i) => {
                                    const queueId = row.QUEUE_ID || row.queue_id;
                                    const token = row.TOKEN_NUMBER || row.token_number;
                                    const name = row.CUSTOMER_NAME || row.customer_name;
                                    const service = row.SERVICE_TYPE || row.service_type;
                                    const priority = row.PRIORITY || row.priority;
                                    return (
                                        <motion.tr
                                            key={queueId}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ delay: i * 0.05 }}
                                        >
                                            <td className={styles.tokenCell}>
                                                <span className={styles.tokenBadge}>{token}</span>
                                            </td>
                                            <td className={styles.nameCell}>
                                                <div className={styles.userAvatar}>
                                                    {name?.[0]?.toUpperCase() || 'C'}
                                                </div>
                                                {name}
                                            </td>
                                            <td>
                                                <span className={styles.serviceBadge}>{service}</span>
                                            </td>
                                            <td>
                                                <span className={`${styles.priorityBadge} ${priority === 1 ? styles.high : styles.normal}`}>
                                                    {priority === 1 ? 'HIGH' : 'NORMAL'}
                                                </span>
                                            </td>
                                            <td>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    className={priority === 1 ? styles.btnServeHigh : styles.btnServe}
                                                    onClick={() => handleServe(queueId, token)}
                                                    disabled={actionLoading === queueId}
                                                >
                                                    {actionLoading === queueId ? <RefreshCcw size={14} className="spin" /> : 'Serve'}
                                                </motion.button>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* QUICK ACTIONS */}
            <motion.div variants={itemVariants} className={styles.quickActions}>
                <Link href="/teller/deposit" className={styles.actionLink}>
                    <div className={styles.actionIcon} style={{ background: 'var(--grad-pearl)' }}>
                        <Banknote size={20} />
                    </div>
                    <span>Quick Deposit</span>
                </Link>
                <Link href="/teller/withdraw" className={styles.actionLink}>
                    <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #1E293B, #0F172A)' }}>
                        <ArrowDownCircle size={20} />
                    </div>
                    <span>Quick Withdrawal</span>
                </Link>
                <Link href="/teller/open-account" className={styles.actionLink}>
                    <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #0D1B2A, #1B263B)' }}>
                        <UserPlus size={20} />
                    </div>
                    <span>Open Account</span>
                </Link>
                <Link href="/teller/lookup" className={styles.actionLink}>
                    <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #1A6B5A, #0F4237)' }}>
                        <Search size={20} />
                    </div>
                    <span>Customer Lookup</span>
                </Link>
            </motion.div>

            {/* ADD TO QUEUE MODAL */}
            <AnimatePresence>
                {showAddModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
                        <motion.div
                            className={styles.modalContent}
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className={styles.modalHeader}>
                                <h3>Add Customer to Queue</h3>
                                <div className={styles.modalIcon}><HandHelping size={24} /></div>
                            </div>
                            <div className={styles.formBody}>
                                <div className={styles.inputGroup}>
                                    <label>CUSTOMER NAME</label>
                                    <input type="text" value={newCustomer} onChange={e => setNewCustomer(e.target.value)}
                                        placeholder="Full legal name" />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>SERVICE TYPE</label>
                                    <select value={newService} onChange={e => setNewService(e.target.value)}>
                                        <option>Cash Deposit</option>
                                        <option>Cash Withdrawal</option>
                                        <option>Open New Account</option>
                                        <option>NEFT Transfer</option>
                                        <option>RTGS Transfer</option>
                                        <option>Account Inquiry</option>
                                        <option>Cheque Deposit</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>PRIORITY LEVEL</label>
                                    <div className={styles.priorityToggle}>
                                        <button onClick={() => setNewPriority(1)}
                                            className={newPriority === 1 ? styles.activeHigh : ''}>
                                            HIGH
                                        </button>
                                        <button onClick={() => setNewPriority(2)}
                                            className={newPriority === 2 ? styles.activeNormal : ''}>
                                            NORMAL
                                        </button>
                                    </div>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleAddToQueue}
                                    disabled={addLoading || !newCustomer.trim()}
                                    className={styles.btnSubmit}
                                >
                                    {addLoading ? <RefreshCcw size={18} className="spin" /> : <><UserCheck size={18} /> ADD TO QUEUE</>}
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
