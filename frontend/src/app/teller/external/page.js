'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function ExternalTransfer() {
    const [fromAccount, setFromAccount] = useState('');
    const [toAccount, setToAccount] = useState('');
    const [ifsc, setIfsc] = useState('');
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('NEFT');
    const [loading, setLoading] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [msg, setMsg] = useState(null);

    const generateOtp = async () => {
        if (!fromAccount) {
            setMsg({ type: 'error', text: 'Please enter the source account first.' });
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/otp/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    purpose: 'TRANSACTION',
                    targetAccountId: fromAccount.trim(),
                    amount: amount,
                    toAccountId: toAccount
                })
            });
            const data = await res.json();
            if (res.ok) {
                setOtpSent(true);
                setMsg({ type: 'success', text: 'OTP sent to customer\'s registered email.' });
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch {
            setMsg({ type: 'error', text: 'Failed to trigger OTP.' });
        }
        setLoading(false);
    };

    const handleTransfer = async () => {
        if (!fromAccount || !toAccount || !ifsc || !amount || Number(amount) <= 0 || !otp) {
            setMsg({ type: 'error', text: 'All fields including Customer OTP are required.' });
            return;
        }
        setLoading(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/teller/transfer/external`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    fromAccountId: fromAccount.trim(),
                    toAccount,
                    ifsc,
                    mode,
                    amount: Number(amount),
                    customerOtpCode: otp.trim()
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `✓ ${data.message}  |  REF: ${data.ref}` });
                setAmount(''); setFromAccount(''); setToAccount(''); setIfsc(''); setOtp(''); setOtpSent(false);
            } else {
                setMsg({ type: 'error', text: data.message || 'External transfer failed.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network connection failed.' });
        }
        setLoading(false);
    };

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>External Transfer</div>
                <div className={styles.headerSubtitle}>Teller Terminal · NEFT / RTGS to other banks · Customer OTP Required</div>
            </header>

            <div className={styles.formPanel}>
                <div className={styles.formGroup}>
                    <label>Source Account Number (Safe Vault)</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input type="text" className={styles.input} style={{ flex: 1 }} placeholder="e.g. ACC-MUM-003-XXXX" value={fromAccount} onChange={e => setFromAccount(e.target.value)} />
                        <button className={styles.btnSecondary} onClick={generateOtp} disabled={loading}>
                            {loading ? '...' : 'SEND OTP'}
                        </button>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Transfer Mode</label>
                    <select className={styles.input} value={mode} onChange={e => setMode(e.target.value)}>
                        <option value="NEFT">NEFT (Standard Clearing)</option>
                        <option value="RTGS">RTGS (High Value, &gt;= ₹2 Lakhs)</option>
                        <option value="IMPS">IMPS (Instant)</option>
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div className={styles.formGroup}>
                        <label>Beneficiary IFSC Code</label>
                        <input type="text" className={styles.input} placeholder="e.g. HDFC0001234" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Beneficiary Account Number</label>
                        <input type="text" className={styles.input} placeholder="e.g. 50100XXXXXXX" value={toAccount} onChange={e => setToAccount(e.target.value)} />
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Transfer Amount (INR)</label>
                    <input type="number" className={styles.inputAmount} placeholder="₹ 0.00" value={amount} min="1" onChange={(e) => setAmount(e.target.value)} />
                </div>

                <div className={styles.formGroup}>
                    <label>Customer OTP Code {otpSent && <span style={{ color: '#34D399' }}>(Sent ✅)</span>}</label>
                    <input type="text" className={styles.input} placeholder="6-digit code from customer's email" value={otp} onChange={e => setOtp(e.target.value)} />
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', fontSize: '12px', color: '#EAB308' }}>
                    ⚠ External transfers require Manager Approval after teller commitment. Ensure the customer provides the OTP sent to their registered email.
                </div>

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <button className={styles.btnPrimary} onClick={handleTransfer} disabled={loading}>
                    {loading ? 'COMMITTING TO ORACLE…' : 'INITIATE EXTERNAL TRANSFER ➔'}
                </button>
            </div>
        </div>
    );
}
