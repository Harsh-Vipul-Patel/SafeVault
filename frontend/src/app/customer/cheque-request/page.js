'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft,
    BookOpen,
    CheckCircle2,
    AlertCircle,
    Info,
    PhoneCall,
    ArrowRight
} from 'lucide-react';
import styles from './request.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function CustomerChequeRequest() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({ accountId: '', leaves: '25' });
    const [msg, setMsg] = useState(null);

    const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

    useEffect(() => {
        const token = getToken();
        fetch(`${API}/api/customer/accounts`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setAccounts(data.accounts || []);
                if (data.accounts?.length > 0) setForm(f => ({ ...f, accountId: data.accounts[0].ACCOUNT_ID }));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMsg({ type: 'info', text: 'Transmitting secure request...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/cheque/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ accountId: form.accountId, leavesCount: parseInt(form.leaves) })
            });
            const data = await res.json();
            setMsg({ type: res.ok ? 'success' : 'error', text: data.message });
        } catch (err) {
            setMsg({ type: 'error', text: 'System disruption: Failed to submit request.' });
        }
        setSubmitting(false);
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

    if (loading) return (
        <div className={styles.loadingState}>
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
                <BookOpen size={24} />
            </motion.div>
            <span>Synchronizing secure accounts...</span>
        </div>
    );

    return (
        <motion.div
            className={styles.layout}
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            <motion.header className={styles.header} variants={itemVariants}>
                <div className={styles.titleGroup}>
                    <h1 className={`${styles.title} text-gradient-gold`}>Request Cheque Book</h1>
                    <p className={styles.subtitle}>Order secure transaction instruments for your account</p>
                </div>
                <Link href="/customer/cheque-management" className={styles.backBtn}>
                    <ChevronLeft size={16} /> REGISTER INDEX
                </Link>
            </motion.header>

            <div className={styles.formContainer}>
                <motion.div
                    className={`${styles.requestCard} pearl-card`}
                    variants={itemVariants}
                >
                    <AnimatePresence mode="wait">
                        {msg && (
                            <motion.div
                                key={msg.text}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className={msg.type === 'error' ? styles.errorBanner : styles.successBanner}
                            >
                                {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                {msg.text}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Select Funding Account</label>
                            <select
                                className={styles.input}
                                value={form.accountId}
                                onChange={e => setForm({ ...form, accountId: e.target.value })}
                            >
                                {accounts.map(a => (
                                    <option key={a.ACCOUNT_ID} value={a.ACCOUNT_ID}>
                                        {a.TYPE_NAME} — {a.ACCOUNT_ID}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.formGroup} style={{ marginTop: '4px' }}>
                            <label className={styles.label}>Number of Leaves</label>
                            <select
                                className={styles.input}
                                value={form.leaves}
                                onChange={e => setForm({ ...form, leaves: e.target.value })}
                            >
                                <option value="25">25 Leaves (Standard)</option>
                                <option value="50">50 Leaves (+ ₹100 Charge)</option>
                                <option value="100">100 Leaves (+ ₹250 Charge)</option>
                            </select>
                        </div>

                        <motion.button
                            type="submit"
                            className={styles.btnPrimary}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={submitting}
                            style={{ marginTop: '8px' }}
                        >
                            {submitting ? 'TRANSMITTING...' : 'SUBMIT SECURE REQUEST'}
                        </motion.button>

                        <div className={styles.noticeText}>
                            <Info size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Your personalized instrument will be dispatched within 5-7 business days.
                        </div>
                    </form>
                </motion.div>

                <motion.div
                    className={`${styles.helpCard} glass-surface`}
                    variants={itemVariants}
                    style={{ marginTop: '32px' }}
                >
                    <h3 className={styles.helpTitle}>Security Alert?</h3>
                    <p className={styles.helpText}>
                        If you need to report a lost or stolen instrument, please initiate a stop-payment sequence immediately through individual instrument controls.
                    </p>
                    <Link href="/customer/support" className={styles.btnSecondary}>
                        <PhoneCall size={14} /> CONTACT BRANCH SUPPORT
                    </Link>
                </motion.div>
            </div>
        </motion.div>
    );
}
