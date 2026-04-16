'use client';
import { useState } from 'react';
import styles from '../../teller/teller.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, CheckCircle, XCircle, Loader2, Landmark, Tag, ShieldCheck, CreditCard, ArrowRight, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerChequeOps() {
    const [tab, setTab] = useState('ISSUE');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [form, setForm] = useState({ accountId: '', leaves: '25', chequeNo: '', amount: '', payee: '', otpCode: '' });

    const handleAction = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const token = getToken();
            let endpoint = '';
            let payload = {};

            if (tab === 'ISSUE') {
                endpoint = '/api/teller/cheque/issue';
                payload = { accountId: form.accountId, leavesCount: form.leaves };
            } else if (tab === 'STOP') {
                endpoint = '/api/teller/cheque/stop';
                payload = { accountId: form.accountId, chequeNumber: form.chequeNo, reason: 'Stop Payment Requested by Customer', customerOtpCode: form.otpCode };
            } else if (tab === 'CLEAR') {
                endpoint = '/api/teller/cheque/clear';
                payload = { draweeAccountId: form.accountId, payeeAccountId: form.payee, chequeNumber: form.chequeNo, amount: form.amount };
            }

            const res = await fetch(`${API}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            setMsg({ type: res.ok ? 'success' : 'error', text: data.message });
            if (res.ok) setForm({ accountId: '', leaves: '25', chequeNo: '', amount: '', payee: '', otpCode: '' });
        } catch (err) {
            setMsg({ type: 'error', text: 'Action failed. Network or system error.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSendOTP = async () => {
        if (!form.accountId || !form.chequeNo) {
            setMsg({ type: 'error', text: 'Account ID and Cheque Number are required to request OTP.' });
            return;
        }
        setLoading(true);
        setMsg(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/auth/request-otp-stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ accountId: form.accountId, chequeNumber: form.chequeNo, reason: 'Stop Payment Requested by Customer' })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'OTP sent to customer email successfully.' });
            } else {
                setMsg({ type: 'error', text: data.message || 'Failed to send OTP.' });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Network Error.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.dashboardContainer} style={{ background: 'transparent', padding: '0', minHeight: 'auto' }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                style={{ maxWidth: '1100px', margin: '0 auto' }}
            >
                <header style={{ marginBottom: '40px', textAlign: 'left' }}>
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}
                    >
                        <motion.div
                            whileHover={{ rotate: 15, scale: 1.1 }}
                            style={{
                                background: 'var(--grad-gold)',
                                padding: '10px',
                                borderRadius: '12px',
                                boxShadow: '0 0 20px rgba(201, 150, 42, 0.3)'
                            }}
                        >
                            <Book size={32} color="#0D1B2A" />
                        </motion.div>
                        <h1 style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: '42px',
                            fontWeight: '900',
                            margin: 0,
                            letterSpacing: '-0.02em'
                        }} className="text-gradient-gold">
                            Cheque Management Terminal
                        </h1>
                    </motion.div>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: 0.4 }}
                        style={{
                            fontSize: '18px',
                            color: 'var(--cream)',
                            maxWidth: '600px',
                            lineHeight: '1.6',
                            fontWeight: '500'
                        }}
                    >
                        Secure processing for inventory issuance, clearing settlements, and stop instruction overrides.
                    </motion.p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '40px', alignItems: 'start' }}>
                    {/* SIDEBAR TABS */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="pearl-card"
                        style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    >
                        <h3 style={{ fontSize: '11px', fontWeight: '800', color: 'var(--gold2)', uppercase: true, letterSpacing: '0.1em', marginBottom: '12px', textTransform: 'uppercase' }}>Operations</h3>
                        {[
                            { id: 'ISSUE', label: 'Issue Cheque Book', icon: Book },
                            { id: 'CLEAR', label: 'Clear Cheque', icon: CreditCard },
                            { id: 'STOP', label: 'Stop Payment', icon: ShieldCheck }
                        ].map(item => (
                            <motion.button
                                key={item.id}
                                whileHover={{ x: 5 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => { setTab(item.id); setMsg(null); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: tab === item.id ? '1px solid var(--gold2)' : '1px solid transparent',
                                    background: tab === item.id ? 'rgba(201, 150, 42, 0.1)' : 'transparent',
                                    color: tab === item.id ? 'var(--gold2)' : 'var(--cream)',
                                    fontWeight: '700',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s',
                                    textAlign: 'left'
                                }}
                            >
                                <item.icon size={18} />
                                {item.label}
                            </motion.button>
                        ))}
                    </motion.div>

                    {/* MAIN FORM */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <motion.section
                            key={tab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="pearl-card"
                            style={{ padding: '40px' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
                                <div style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    padding: '10px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--glass-border)'
                                }}>
                                    {tab === 'ISSUE' ? <Landmark size={22} style={{ color: 'var(--gold2)' }} /> :
                                        tab === 'CLEAR' ? <CheckCircle size={22} style={{ color: 'var(--gold2)' }} /> :
                                            <ShieldCheck size={22} style={{ color: 'var(--gold2)' }} />}
                                </div>
                                <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: 'var(--white)' }}>
                                    {tab === 'ISSUE' ? 'Leaf Issuance Protocol' : tab === 'CLEAR' ? 'Clearing & Settlement' : 'Stop Instruction Override'}
                                </h2>
                            </div>

                            <form onSubmit={handleAction} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tab === 'CLEAR' ? 'Drawee Account ID' : 'Account Identification'}</label>
                                    <input
                                        type="text"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '12px',
                                            padding: '14px 16px',
                                            color: 'var(--white)',
                                            fontSize: '15px',
                                            transition: 'all 0.3s'
                                        }}
                                        className="focus:ring-2 focus:ring-amber-500/30 outline-none"
                                        value={form.accountId}
                                        onChange={e => setForm({ ...form, accountId: e.target.value })}
                                        placeholder="e.g. ACC-MUM-003-001"
                                        required
                                    />
                                </div>

                                {tab === 'ISSUE' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory Volume (Leaves)</label>
                                        <select
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.04)',
                                                border: '1px solid var(--glass-border)',
                                                borderRadius: '12px',
                                                padding: '14px 40px 14px 16px',
                                                color: 'var(--white)',
                                                fontSize: '15px',
                                                outline: 'none',
                                                appearance: 'none',
                                                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C9962A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundPosition: 'right 16px center',
                                                backgroundSize: '16px',
                                                cursor: 'pointer'
                                            }}
                                            value={form.leaves}
                                            onChange={e => setForm({ ...form, leaves: e.target.value })}
                                        >
                                            <option value="25" style={{ background: '#0D1B2A' }}>Standard — 25 Leaves</option>
                                            <option value="50" style={{ background: '#0D1B2A' }}>Corporate — 50 Leaves</option>
                                            <option value="100" style={{ background: '#0D1B2A' }}>Institutional — 100 Leaves</option>
                                        </select>
                                    </div>
                                )}

                                {(tab === 'STOP' || tab === 'CLEAR') && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cheque Serial Number</label>
                                        <input
                                            type="text"
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.04)',
                                                border: '1px solid var(--glass-border)',
                                                borderRadius: '12px',
                                                padding: '14px 16px',
                                                color: 'var(--white)',
                                                fontSize: '15px'
                                            }}
                                            className="focus:ring-2 focus:ring-amber-500/30 outline-none"
                                            value={form.chequeNo}
                                            onChange={e => setForm({ ...form, chequeNo: e.target.value })}
                                            placeholder="6-digit unique identifier"
                                            required
                                        />
                                    </div>
                                )}

                                {tab === 'STOP' && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Authorization OTP</label>
                                                <button
                                                    type="button"
                                                    onClick={handleSendOTP}
                                                    disabled={loading}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--gold2)',
                                                        color: 'var(--gold2)',
                                                        padding: '4px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '10px',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        letterSpacing: '0.05em',
                                                        textTransform: 'uppercase'
                                                    }}
                                                >
                                                    Send OTP
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '12px',
                                                    padding: '14px 16px',
                                                    color: 'var(--white)',
                                                    fontSize: '15px',
                                                    letterSpacing: '0.2em',
                                                    textAlign: 'center'
                                                }}
                                                className="focus:ring-2 focus:ring-amber-500/30 outline-none"
                                                value={form.otpCode}
                                                onChange={e => setForm({ ...form, otpCode: e.target.value })}
                                                placeholder="6-DIGIT CODE"
                                                maxLength="6"
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                {tab === 'CLEAR' && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Settlement Amount (INR)</label>
                                            <input
                                                type="number"
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '12px',
                                                    padding: '14px 16px',
                                                    color: 'var(--white)',
                                                    fontSize: '15px'
                                                }}
                                                className="focus:ring-2 focus:ring-amber-500/30 outline-none"
                                                value={form.amount}
                                                onChange={e => setForm({ ...form, amount: e.target.value })}
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payee Account ID</label>
                                            <input
                                                type="text"
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '12px',
                                                    padding: '14px 16px',
                                                    color: 'var(--white)',
                                                    fontSize: '15px'
                                                }}
                                                className="focus:ring-2 focus:ring-amber-500/30 outline-none"
                                                value={form.payee}
                                                onChange={e => setForm({ ...form, payee: e.target.value })}
                                                placeholder="e.g. ACC-MUM-003-002"
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                <div style={{ marginTop: '16px' }}>
                                    <motion.button
                                        type="submit"
                                        whileHover={{ scale: 1.02, y: -2 }}
                                        whileTap={{ scale: 0.98 }}
                                        disabled={loading}
                                        style={{
                                            width: '100%',
                                            height: '60px',
                                            background: 'var(--grad-gold)',
                                            border: 'none',
                                            borderRadius: '14px',
                                            color: 'var(--navy)',
                                            fontSize: '15px',
                                            fontWeight: '900',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '12px',
                                            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : tab === 'ISSUE' ? 'Authorize Leaf Issuance' : tab === 'CLEAR' ? 'Finalize Clearing Settlement' : 'Authorize Stop Instruction'}
                                        {!loading && <ArrowRight size={18} />}
                                    </motion.button>
                                    <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '16px', fontWeight: '500' }}>
                                        Authorized actions are cryptographically signed and recorded in the system audit trail.
                                    </p>
                                </div>
                            </form>
                        </motion.section>

                        <AnimatePresence>
                            {msg && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        padding: '20px 24px',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.08)' :
                                            msg.type === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                                        border: `1px solid ${msg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' :
                                            msg.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                                        color: msg.type === 'success' ? '#34D399' :
                                            msg.type === 'error' ? '#F87171' : 'var(--cream)',
                                        fontSize: '15px',
                                        fontWeight: '600',
                                        backdropFilter: 'blur(10px)'
                                    }}
                                >
                                    {msg.type === 'success' ? <CheckCircle size={22} /> :
                                        msg.type === 'error' ? <XCircle size={22} /> : <AlertCircle size={22} />}
                                    {msg.text}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
