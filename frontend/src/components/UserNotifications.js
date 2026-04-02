'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './notifications.module.css';
import { useToast } from '../context/ToastContext';

// ─── Notification Type Config ──────────────────────────────────────
const TYPE_MAP = {
    // Customer transaction events
    TXN_ALERT: (d) => {
        if (d?.txn_type === 'TRANSFER_DEBIT') return { emoji: '↗', label: 'Money Sent', cat: 'debit' };
        if (d?.txn_type === 'TRANSFER_CREDIT') return { emoji: '↙', label: 'Money Received', cat: 'credit' };
        if (d?.txn_type === 'CREDIT') return { emoji: '＋', label: 'Cash Deposited', cat: 'credit' };
        if (d?.txn_type === 'DEBIT') return { emoji: '－', label: 'Cash Withdrawn', cat: 'debit' };
        return { emoji: '◉', label: 'Transaction', cat: 'info' };
    },
    EXT_TXN_INITIATED: () => ({ emoji: '⇡', label: 'Transfer Pending', cat: 'warning' }),
    EXT_TXN_APPROVED: () => ({ emoji: '✓', label: 'Transfer Complete', cat: 'success' }),
    LOAN_DISBURSED: () => ({ emoji: '🏦', label: 'Loan Credited', cat: 'loan' }),
    EMI_PAID: () => ({ emoji: '📑', label: 'EMI Recorded', cat: 'loan' }),
    FD_OPENED: () => ({ emoji: '🔒', label: 'FD Created', cat: 'deposit' }),
    FD_MATURED: () => ({ emoji: '🎯', label: 'FD Matured', cat: 'success' }),
    FD_CLOSED: () => ({ emoji: '⚠', label: 'FD Closed Early', cat: 'warning' }),
    RD_OPENED: () => ({ emoji: '🔄', label: 'RD Started', cat: 'deposit' }),
    BENE_ADDED: () => ({ emoji: '＋', label: 'Beneficiary Added', cat: 'info' }),
    BENE_ACTIVE: () => ({ emoji: '✓', label: 'Beneficiary Active', cat: 'success' }),
    SI_EXECUTED: () => ({ emoji: '⟳', label: 'Auto-Pay Done', cat: 'success' }),
    SI_FAILED: () => ({ emoji: '✕', label: 'Auto-Pay Failed', cat: 'debit' }),
    SR_CREATED: () => ({ emoji: '📋', label: 'Request Filed', cat: 'service' }),
    SR_RESOLVED: () => ({ emoji: '✓', label: 'Request Resolved', cat: 'success' }),
    CHQ_BOOK_ISSUED: () => ({ emoji: '📒', label: 'Cheque Book Ready', cat: 'info' }),
    ACCT_FROZEN: () => ({ emoji: '❄', label: 'Account Frozen', cat: 'debit' }),
    ACCT_CLOSED: () => ({ emoji: '🔒', label: 'Account Closed', cat: 'warning' }),
    // Staff events
    TXN_PROCESSED: () => ({ emoji: '✓', label: 'Transaction Done', cat: 'success' }),
    SR_ASSIGNED: () => ({ emoji: '📬', label: 'Request Assigned', cat: 'service' }),
    PENDING_APPROVAL: () => ({ emoji: '⏳', label: 'Needs Approval', cat: 'approval' }),
    SR_PENDING: () => ({ emoji: '📋', label: 'Open Request', cat: 'service' }),
    EMI_OVERDUE: () => ({ emoji: '🚨', label: 'EMI Overdue', cat: 'debit' }),
};

function getTypeInfo(title, data) {
    const fn = TYPE_MAP[title];
    if (fn) return fn(data);
    // Dynamic prefixes
    if (title?.startsWith('AUDIT_')) return { emoji: '📊', label: 'Audit Entry', cat: 'info' };
    if (title?.startsWith('LOAN_APP_')) {
        const s = title.replace('LOAN_APP_', '');
        if (s === 'PENDING') return { emoji: '⏳', label: 'Loan Pending', cat: 'approval' };
        if (s === 'APPROVED') return { emoji: '✓', label: 'Loan Approved', cat: 'success' };
        if (s === 'DISBURSED') return { emoji: '🏦', label: 'Loan Disbursed', cat: 'loan' };
        return { emoji: '📄', label: 'Loan Update', cat: 'loan' };
    }
    return { emoji: '🔔', label: title?.replace(/_/g, ' ')?.toLowerCase()?.replace(/^\w/, c => c.toUpperCase()) || 'Notification', cat: 'info' };
}

const CAT_STYLES = {
    credit: styles.typeCredit,
    debit: styles.typeDebit,
    info: styles.typeInfo,
    warning: styles.typeWarning,
    success: styles.typeSuccess,
    loan: styles.typeLoan,
    deposit: styles.typeDeposit,
    service: styles.typeService,
    approval: styles.typeApproval,
};

// ─── Human-Readable Message Formatter ──────────────────────────────
function fmtAmt(n) {
    const num = Number(n);
    if (isNaN(num)) return '₹0';
    if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
    if (num >= 1000) return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return '₹' + num.toFixed(2);
}

function formatMessage(triggerEvent, rawMessage) {
    let d;
    try { d = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage; } catch { return rawMessage || ''; }
    if (!d || typeof d !== 'object') return String(rawMessage || '');

    switch (triggerEvent) {
        case 'TXN_ALERT': {
            const bal = fmtAmt(d.balance_after);
            if (d.txn_type === 'TRANSFER_DEBIT') return { text: `${fmtAmt(d.amount)} sent from your account`, sub: `Available balance: ${bal}`, amt: d.amount, dir: 'debit' };
            if (d.txn_type === 'TRANSFER_CREDIT') return { text: `${fmtAmt(d.amount)} received in your account`, sub: `Available balance: ${bal}`, amt: d.amount, dir: 'credit' };
            if (d.txn_type === 'CREDIT') return { text: `Cash deposit of ${fmtAmt(d.amount)} successful`, sub: `Updated balance: ${bal}`, amt: d.amount, dir: 'credit' };
            return { text: `Cash withdrawal of ${fmtAmt(d.amount)} processed`, sub: `Remaining balance: ${bal}`, amt: d.amount, dir: 'debit' };
        }
        case 'EXT_TXN_INITIATED':
            return { text: `${fmtAmt(d.amount)} transfer to external account initiated`, sub: `Destination: ••••${d.dest_acc?.slice(-4) || ''}  ·  Awaiting manager approval` };
        case 'EXT_TXN_APPROVED':
            return { text: `External transfer of ${fmtAmt(d.amount)} settled`, sub: `UTR: ${d.utr}  ·  Destination: ••••${d.dest_acc?.slice(-4) || ''}`, amt: d.amount, dir: 'debit' };
        case 'LOAN_DISBURSED':
            return { text: `Your loan has been disbursed`, sub: `Loan A/C: ${d.loan_account_id}  ·  Amount: ${fmtAmt(d.amount)}`, amt: d.amount, dir: 'credit' };
        case 'EMI_PAID':
            return { text: `EMI payment of ${fmtAmt(d.emi_amount)} recorded`, sub: `Loan: ${d.loan_account_id}${d.penalty > 0 ? `  ·  Late fee: ${fmtAmt(d.penalty)}` : ''}`, amt: d.emi_amount, dir: 'debit' };
        case 'FD_OPENED':
            return { text: `Fixed Deposit created for ${fmtAmt(d.amount)}`, sub: `Rate: ${d.rate}%  ·  Tenure: ${d.tenure} months  ·  Matures: ${d.maturity_date}` };
        case 'FD_MATURED':
            return { text: `Your FD has matured! Funds credited.`, sub: `Payout: ${fmtAmt(d.maturity_amount)}${d.auto_renewed === 'Y' ? '  ·  Auto-renewed' : ''}`, amt: d.maturity_amount, dir: 'credit' };
        case 'FD_CLOSED':
            return { text: `FD closed before maturity`, sub: `Net payout after penalty: ${fmtAmt(d.payout_amount)}`, amt: d.payout_amount, dir: 'credit' };
        case 'RD_OPENED':
            return { text: `Recurring Deposit started`, sub: `${fmtAmt(d.monthly_instalment)}/month  ·  ${d.tenure} months  ·  ${d.rate}% p.a.` };
        case 'BENE_ADDED':
            return { text: `New beneficiary "${d.beneficiary_name}" added`, sub: `A/C: ••••${d.account?.slice(-4) || ''}  ·  24hr cooling period active` };
        case 'BENE_ACTIVE':
            return { text: `"${d.beneficiary_name}" is now ready for transfers`, sub: 'Cooling period completed' };
        case 'SI_EXECUTED':
            return { text: `Auto-pay of ${fmtAmt(d.amount)} executed`, sub: `Next scheduled: ${d.next_date}`, amt: d.amount, dir: 'debit' };
        case 'SI_FAILED':
            return { text: `Auto-pay could not be processed`, sub: d.error || 'Insufficient balance or account issue' };
        case 'SR_CREATED':
            return { text: `Service request submitted`, sub: `Type: ${d.request_type?.replace(/_/g, ' ')}` };
        case 'SR_RESOLVED':
            return { text: `Your service request has been ${d.status?.toLowerCase() || 'resolved'}`, sub: d.resolution_notes || d.request_type?.replace(/_/g, ' ') };
        case 'CHQ_BOOK_ISSUED':
            return { text: `Cheque book issued to your account`, sub: `Range: ${d.start_num} – ${d.end_num}  ·  ${d.leaves} leaves` };
        default:
            return { text: rawMessage, sub: '' };
    }
}

// ─── Component ─────────────────────────────────────────────────────
export default function UserNotifications({ bellClassName }) {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [hasNew, setHasNew] = useState(false);
    const dropdownRef = useRef(null);
    const { showToast } = useToast();

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem('suraksha_token');
            if (!token) return;

            const res = await fetch('http://localhost:5000/api/auth/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setNotifications(prev => {
                    if (data.length > 0 && prev.length > 0 && data[0].id !== prev[0].id) {
                        if (!isOpen) {
                            setHasNew(true);
                            const newNotifs = data.filter(d => !prev.some(p => p.id === d.id));
                            newNotifs.forEach(notif => {
                                const parsedData = tryParse(notif.message);
                                const info = getTypeInfo(notif.title, parsedData);
                                const msg = formatMessage(notif.title, notif.message);
                                const text = typeof msg === 'object' ? msg.text : msg;
                                
                                let toastType = 'INFO';
                                if (['credit', 'success'].includes(info.cat)) toastType = 'SUCCESS';
                                if (info.cat === 'debit') toastType = 'WARNING';
                                if (['SI_FAILED', 'EMI_OVERDUE'].includes(notif.title)) toastType = 'ERROR';
                                
                                showToast(`${info.label}: ${text}`, toastType, 5000);
                            });
                        }
                    } else if (prev.length === 0 && data.length > 0) {
                        if (!isOpen) setHasNew(true);
                    }
                    return data;
                });
            }
        } catch (err) {
            console.error("Failed to fetch notifications:", err);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 5000);
        return () => clearInterval(interval);
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        else document.removeEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggleOpen = () => {
        if (!isOpen) { setHasNew(false); fetchNotifications(); }
        setIsOpen(!isOpen);
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        if (diff < 172800000) return 'yesterday';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    return (
        <div className={styles.notificationContainer} ref={dropdownRef}>
            <div className={bellClassName} onClick={toggleOpen} role="button" tabIndex={0} style={{ cursor: 'pointer', position: 'relative' }}>
                <Bell size={18} />
                {hasNew && <span className={styles.notifBadge}></span>}
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className={styles.dropdownPanel}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                        <div className={styles.panelHeader}>
                            <h3 className={styles.panelTitle}>Notifications</h3>
                            {notifications.length > 0 && (
                                <span className={styles.alertCount}>{notifications.length}</span>
                            )}
                        </div>

                        <div className={styles.logsList}>
                            {notifications.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Activity size={20} className={styles.emptyIcon} />
                                    <p>You're all caught up</p>
                                </div>
                            ) : (
                                notifications.map((notif, i) => {
                                    const parsedData = tryParse(notif.message);
                                    const info = getTypeInfo(notif.title, parsedData);
                                    const msg = formatMessage(notif.title, notif.message);
                                    const isRich = typeof msg === 'object';
                                    const text = isRich ? msg.text : msg;
                                    const sub = isRich ? msg.sub : '';

                                    return (
                                        <motion.div
                                            key={notif.id}
                                            className={`${styles.logItem} ${CAT_STYLES[info.cat] || styles.typeInfo}`}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03, duration: 0.2 }}
                                        >
                                            <div className={styles.logHeader}>
                                                <div className={styles.logIconWrap}>
                                                    <span className={styles.logEmoji}>{info.emoji}</span>
                                                    <span className={styles.logAction}>{info.label}</span>
                                                </div>
                                                <span className={styles.logTime}>{formatTime(notif.timestamp)}</span>
                                            </div>
                                            <div className={styles.logMessage}>
                                                {text}
                                            </div>
                                            {sub && (
                                                <div className={styles.logMessage} style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 2 }}>
                                                    {sub}
                                                </div>
                                            )}
                                            {isRich && msg.amt && (
                                                <span className={`${styles.amountBadge} ${
                                                    msg.dir === 'credit' ? styles.amountCredit :
                                                    msg.dir === 'debit' ? styles.amountDebit :
                                                    styles.amountNeutral
                                                }`}>
                                                    {msg.dir === 'credit' ? '+' : '−'} {fmtAmt(msg.amt)}
                                                </span>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function tryParse(str) {
    try { return typeof str === 'string' ? JSON.parse(str) : str; } catch { return null; }
}
