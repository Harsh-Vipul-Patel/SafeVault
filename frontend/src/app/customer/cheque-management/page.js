'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    Plus,
    ChevronLeft,
    CreditCard,
    ArrowUpRight,
    ArrowRight,
    CheckCircle2,
    AlertTriangle,
    Info,
    MoreVertical,
    X,
    Share2,
    Printer,
    FileText,
    Shield,
    Clock,
    Layers
} from 'lucide-react';
import styles from './cheque.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ChequeManagement() {
    const [books, setBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Stop Payment Form
    const [showStopForm, setShowStopForm] = useState(false);
    const [stopData, setStopData] = useState({ accountId: '', chequeNumber: '', reason: '', otpCode: '' });
    const [otpSent, setOtpSent] = useState(false);
    const [msg, setMsg] = useState(null);

    const getToken = () => localStorage.getItem('suraksha_token');

    const fetchBooks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/customer/cheque/books`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) {
                setBooks(data);
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError('System Link Interrupted: Oracle Connection Timeout');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks]);

    const fetchHistory = async (bookId) => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/customer/cheque/history/${bookId}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) {
                setHistory(data);
                const book = books.find(b => b.BOOK_ID === bookId);
                setSelectedBook(book);
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to fetch cheque history.' });
        }
        setLoading(false);
    };

    const generateOtp = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/otp/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ purpose: 'TRANSACTION' })
            });
            if (res.ok) {
                setOtpSent(true);
                setMsg({ type: 'success', text: 'OTP sent to your registered email.' });
            } else {
                const data = await res.json();
                setMsg({ type: 'error', text: data.message });
            }
        } catch {
            setMsg({ type: 'error', text: 'Failed to trigger OTP.' });
        }
        setLoading(false);
    };

    const handleStopPayment = async () => {
        if (!stopData.chequeNumber || !stopData.reason || !stopData.otpCode) {
            setMsg({ type: 'error', text: 'Please fill all fields and enter OTP.' });
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/customer/cheque/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ ...stopData, accountId: selectedBook.ACCOUNT_ID })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'Stop payment instruction recorded.' });
                setStopData({ accountId: '', chequeNumber: '', reason: '', otpCode: '' });
                setOtpSent(false);
                setShowStopForm(false);
                fetchHistory(selectedBook.BOOK_ID);
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch {
            setMsg({ type: 'error', text: 'Request failed.' });
        }
        setLoading(false);
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

    if (error) return (
        <div className={styles.errorState}>
            <AlertTriangle size={24} />
            <p>{error}</p>
        </div>
    );

    return (
        <motion.div
            className={styles.container}
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <motion.header variants={itemVariants} className={styles.header}>
                <div className={styles.titleGroup}>
                    <h1 className={`${styles.greeting} text-gradient-gold`}>Cheque Registers</h1>
                    <p className={styles.headerSub}>Manage your physical instruments & secure transaction leaves</p>
                </div>
                {!selectedBook && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={styles.btnPrimary}
                        onClick={() => window.location.href = '/customer/cheque-request'}
                    >
                        <Plus size={16} /> REQUEST NEW BOOK
                    </motion.button>
                )}
            </motion.header>

            {!selectedBook ? (
                <div className={styles.bookGrid}>
                    <AnimatePresence>
                        {books.map((book, i) => (
                            <motion.div
                                key={book.BOOK_ID}
                                className={`${styles.bookCard} pearl-card`}
                                onClick={() => fetchHistory(book.BOOK_ID)}
                                variants={itemVariants}
                                whileHover={{ y: -8, rotateY: 5 }}
                                layout
                            >
                                <div className={styles.bookCover}>
                                    <div className={styles.bookGlow} />
                                    <div className={styles.bookBrand}>Safe Vault</div>
                                    <div className={styles.bookType}>CHEQUE BOOK</div>
                                    <div className={styles.bookPattern} />
                                </div>
                                <div className={styles.bookInfo}>
                                    <div className={styles.bookMeta}>
                                        <div className={styles.metaItem}>
                                            <CreditCard size={12} />
                                            <span>{book.ACCOUNT_ID}</span>
                                        </div>
                                        <div className={styles.metaItem}>
                                            <Layers size={12} />
                                            <span>{book.LEAVES_COUNT} Leaves</span>
                                        </div>
                                    </div>
                                    <div className={styles.bookRange}>
                                        {book.START_CHEQUE_NUMBER} <ArrowRight size={10} /> {book.END_CHEQUE_NUMBER}
                                    </div>
                                    <div className={styles.bookUsage}>
                                        <div className={styles.usageBar}>
                                            <motion.div
                                                className={styles.usageFill}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(book.LEAVES_USED / book.LEAVES_COUNT) * 100}%` }}
                                            />
                                        </div>
                                        <span>{book.LEAVES_USED} used</span>
                                    </div>
                                    <div className={`${styles.statusTag} ${book.STATUS === 'ACTIVE' ? styles.statusActive : ''}`}>
                                        {book.STATUS}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {books.length === 0 && !loading && (
                        <motion.div variants={itemVariants} className={styles.emptyState}>
                            <FileText size={48} className={styles.emptyIcon} />
                            <p>No active instruments recorded in your portfolio.</p>
                        </motion.div>
                    )}
                </div>
            ) : (
                <motion.div variants={itemVariants} className={`${styles.detailView} glass-surface`}>
                    <div className={styles.detailHeader}>
                        <button className={styles.backBtn} onClick={() => setSelectedBook(null)}>
                            <ChevronLeft size={16} /> ALL INSTRUMENTS
                        </button>
                        <div className={styles.detailActions}>
                            <button className={styles.btnGhost}><Printer size={14} /> EXPORT</button>
                            <button className={styles.stopBtn} onClick={() => setShowStopForm(true)}>
                                <Shield size={14} /> STOP PAYMENT
                            </button>
                        </div>
                    </div>

                    <div className={styles.bookSummary}>
                        <div className={styles.summaryInfo}>
                            <h2>Range: {selectedBook.START_CHEQUE_NUMBER} — {selectedBook.END_CHEQUE_NUMBER}</h2>
                            <p>Linked Account Control: <code>{selectedBook.ACCOUNT_ID}</code></p>
                        </div>
                        <div className={styles.summaryStats}>
                            <div className={styles.statBox}>
                                <span className={styles.statVal}>{selectedBook.LEAVES_COUNT - selectedBook.LEAVES_USED}</span>
                                <span className={styles.statLbl}>REMAINING</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.leafTableContainer}>
                        <table className={styles.leafTable}>
                            <thead>
                                <tr>
                                    <th>Cheque Serial</th>
                                    <th>Presentation Date</th>
                                    <th>Settlement</th>
                                    <th style={{ textAlign: 'right' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {history.map((chq, i) => (
                                        <motion.tr
                                            key={chq.CHEQUE_ID}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                        >
                                            <td className={styles.chqNum}># {chq.CHEQUE_NUMBER}</td>
                                            <td className={styles.dateCell}>
                                                <Clock size={12} /> {chq.PRESENTED_AT ? new Date(chq.PRESENTED_AT).toLocaleDateString() : 'Pending'}
                                            </td>
                                            <td className={styles.amountCell}>
                                                {chq.AMOUNT ? <span className={styles.amount}>₹ {chq.AMOUNT.toLocaleString()}</span> : <span className={styles.mutedText}>—</span>}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={`${styles.statusTagSmall} ${styles['status_' + chq.STATUS]}`}>
                                                    {chq.STATUS === 'CLEARED' && <CheckCircle2 size={10} />}
                                                    {chq.STATUS === 'STOPPED' && <X size={10} />}
                                                    {chq.STATUS}
                                                </span>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {history.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className={styles.emptyRow}>No transactional activity detected for this instrument range.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            <AnimatePresence>
                {showStopForm && (
                    <motion.div
                        className={styles.modalOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className={styles.modal}
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <div className={styles.modalHeader}>
                                <div className={styles.modalTitleGroup}>
                                    <Shield className={styles.modalIcon} />
                                    <h3>Stop Payment Request</h3>
                                </div>
                                <button className={styles.closeBtn} onClick={() => setShowStopForm(false)}><X size={18} /></button>
                            </div>

                            <div className={styles.formBody}>
                                <div className={styles.formGroup}>
                                    <label>CHEQUE SERIAL NUMBER</label>
                                    <input
                                        type="text"
                                        placeholder="Enter 6-digit number"
                                        value={stopData.chequeNumber}
                                        onChange={e => setStopData({ ...stopData, chequeNumber: e.target.value })}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>REASON FOR INTERVENTION</label>
                                    <select
                                        value={stopData.reason}
                                        onChange={e => setStopData({ ...stopData, reason: e.target.value })}
                                    >
                                        <option value="">Select Priority Reason</option>
                                        <option value="Lost">Instrument Lost</option>
                                        <option value="Stolen">Instrument Stolen</option>
                                        <option value="Duplicate Issue">Duplicate Issuance</option>
                                        <option value="Transaction Cancelled">Cancelled Transaction</option>
                                        <option value="Other">Security Policy Escalation</option>
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label>DUAL-AUTH VERIFICATION</label>
                                    <div className={styles.otpRow}>
                                        <input
                                            type="text"
                                            placeholder="Verification Code"
                                            value={stopData.otpCode}
                                            onChange={e => setStopData({ ...stopData, otpCode: e.target.value })}
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={styles.otpBtn}
                                            onClick={generateOtp}
                                            disabled={loading}
                                        >
                                            {otpSent ? 'RESEND' : 'TRANSMIT'}
                                        </motion.button>
                                    </div>
                                </div>

                                {msg && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`${styles.msgBanner} ${styles[msg.type]}`}
                                    >
                                        {msg.text}
                                    </motion.div>
                                )}

                                <div className={styles.modalActions}>
                                    <button className={styles.cancelBtn} onClick={() => setShowStopForm(false)}>CANCEL</button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={styles.confirmBtn}
                                        onClick={handleStopPayment}
                                        disabled={loading}
                                    >
                                        {loading ? 'PROCESSING...' : 'EXECUTE STOP COMMAND'}
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
