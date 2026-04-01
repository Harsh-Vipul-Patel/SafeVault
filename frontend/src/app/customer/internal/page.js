'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InternalTransfer() {
    const [accounts, setAccounts] = useState([]);
    const [fromAccountId, setFromAccountId] = useState('');
    const [toAccount, setToAccount] = useState('');
    const [amount, setAmount] = useState('');
    const [desc, setDesc] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingAccts, setLoadingAccts] = useState(true);
    const [message, setMessage] = useState(null);

    // OTP State
    const [showOtp, setShowOtp] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);
    const [errorModalConfig, setErrorModalConfig] = useState(null);

    useEffect(() => {
        let timer;
        if (showOtp && timeLeft > 0) {
            timer = setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && showOtp) {
            setMessage({ type: 'error', text: 'OTP has expired. Please cancel and request a new one.' });
        }
        return () => clearInterval(timer);
    }, [showOtp, timeLeft]);

    useEffect(() => {
        fetch(`${API}/api/customer/accounts`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        })
            .then(r => r.json())
            .then(data => {
                const accts = data.accounts || [];
                setAccounts(accts);
                if (accts.length > 0) {
                    setFromAccountId(accts[0].ACCOUNT_ID || accts[0].account_id);
                }
                setLoadingAccts(false);
            })
            .catch(() => setLoadingAccts(false));
    }, []);

    const handleTransfer = async () => {
        if (!fromAccountId || !toAccount || !amount || Number(amount) <= 0) {
            setMessage({ type: 'error', text: 'Please fill all required fields with valid values.' });
            return;
        }
        if (fromAccountId.trim() === toAccount.trim()) {
            setMessage({ type: 'error', text: 'Source and destination accounts cannot be the same.' });
            return;
        }

        // Pre-check: block transfer if sender account is FROZEN
        const senderAccount = accounts.find(a => (a.ACCOUNT_ID || a.account_id) === fromAccountId);
        if (senderAccount && (senderAccount.STATUS || senderAccount.status) === 'FROZEN') {
            setErrorModalConfig({ type: 'SENDER_FROZEN', accountId: fromAccountId });
            return;
        }

        // Before actual transfer, request OTP
        setLoading(true); setMessage(null);
        try {
            const res = await fetch(`${API}/api/otp/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ purpose: 'TRANSACTION' })
            });
            const data = await res.json();
            if (res.ok) {
                setShowOtp(true);
                setOtpCode('');
                setTimeLeft(60);
                setMessage(null);
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to request OTP.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network connection failed.' });
        }
        setLoading(false);
    };

    const submitTransfer = async () => {
        if (!otpCode || otpCode.length < 6) {
            setMessage({ type: 'error', text: 'Please enter a valid 6-digit OTP.' });
            return;
        }
        setOtpLoading(true); setMessage(null);
        try {
            const res = await fetch(`${API}/api/customer/transfer/internal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ fromAccountId, toAccountId: toAccount.trim(), amount: Number(amount), description: desc, otpCode })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: `✓ ${data.message}  |  REF: ${data.ref}` });
                setAmount(''); setToAccount(''); setDesc('');
                setShowOtp(false);
            } else {
                let errorTxt = data.message || 'Transfer failed.';
                if (errorTxt.includes('Insufficient funds for transfer')) {
                    setShowOtp(false);
                    setErrorModalConfig({ type: 'INSUFFICIENT_FUNDS', available: selectedAcc?.BALANCE || selectedAcc?.balance || 0 });
                    return;
                }
                if (errorTxt.includes('Receiver account is not ACTIVE')) {
                    setShowOtp(false);
                    setErrorModalConfig({ type: 'FROZEN_RECEIVER' });
                    return;
                }
                if (errorTxt.includes('Sender account is') || data.code === 'SENDER_ACCOUNT_NOT_ACTIVE') {
                    setShowOtp(false);
                    setErrorModalConfig({ type: 'SENDER_FROZEN', accountId: fromAccountId });
                    return;
                }
                
                if (data.attemptsLeft !== undefined) {
                    errorTxt += ` (Attempts remaining: ${data.attemptsLeft})`;
                    if (data.attemptsLeft === 0) {
                        setShowOtp(false);
                    }
                }
                setMessage({ type: 'error', text: errorTxt });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network connection failed. Is the backend running?' });
        }
        setOtpLoading(false);
    };

    const selectedAcc = accounts.find(a => (a.ACCOUNT_ID || a.account_id) === fromAccountId);

    return (
        <div className={styles.pageWrap}>
            <h1 className={styles.pageTitle}>Internal Fund Transfer</h1>
            <p className={styles.pageSubtitle}>Transfer between Safe Vault accounts · Calls Oracle <code>sp_internal_transfer</code></p>

            <div className={styles.formPanel}>
                <div className={styles.formGroup}>
                    <label>From Account</label>
                    {loadingAccts ? (
                        <div className={styles.loadingText}>Loading your accounts…</div>
                    ) : (
                        <select
                            className={styles.input}
                            value={fromAccountId}
                            onChange={e => setFromAccountId(e.target.value)}
                        >
                            {accounts.map(acc => {
                                const id = acc.ACCOUNT_ID || acc.account_id;
                                const type = acc.TYPE_NAME || acc.type_name || 'Account';
                                const bal = acc.BALANCE || acc.balance;
                                return (
                                    <option key={id} value={id}>
                                        {type} — {id} ({formatINR(bal)})
                                    </option>
                                );
                            })}
                            {accounts.length === 0 && <option>No accounts found</option>}
                        </select>
                    )}
                    {selectedAcc && (
                        <>
                            <div className={styles.balanceHint}>
                                Available: <strong>{formatINR(selectedAcc.BALANCE || selectedAcc.balance)}</strong>
                            </div>
                            {(selectedAcc.STATUS === 'FROZEN' || selectedAcc.status === 'FROZEN') && (
                                <div style={{ color: '#EF4444', fontSize: '13px', marginTop: '6px', fontWeight: 'bold' }}>
                                    ⚠️ This account is FROZEN. Outbound transfers are blocked.
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className={styles.formGroup}>
                    <label>To Internal Account (Account ID)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. ACC-MUM-003-XXXX"
                        value={toAccount}
                        onChange={e => setToAccount(e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Amount (INR)</label>
                    <input
                        type="number"
                        className={styles.inputAmount}
                        placeholder="₹ 0.00"
                        value={amount}
                        min="1"
                        onChange={e => setAmount(e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Remarks / Description (Optional)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="Enter description..."
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                    />
                </div>

                <div className={styles.infoBox}>
                    ℹ High-value transfers (&gt; ₹2,00,000) require manager dual-approval before settlement.
                </div>

                {message && (
                    <div className={`${styles.message} ${message.type === 'error' ? styles.msgError : styles.msgSuccess}`}>
                        {message.text}
                    </div>
                )}

                <button className={styles.btnSubmit} onClick={handleTransfer} disabled={loading || loadingAccts}>
                    {loading ? 'PROCESSING…' : 'INITIATE TRANSFER ➔'}
                </button>
            </div>

            {showOtp && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2 className={styles.modalTitle}>Security Verification</h2>
                        <p className={styles.modalText}>
                            We've sent a One-Time Password (OTP) to your registered email address to verify this transaction.
                        </p>
                        <div className={styles.formGroup}>
                            <label>Enter 6-digit OTP</label>
                            <input
                                type="text"
                                maxLength={6}
                                className={styles.otpInput}
                                value={otpCode}
                                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="------"
                                autoFocus
                                disabled={timeLeft === 0}
                            />
                        </div>

                        <div style={{ textAlign: 'center', marginBottom: '15px', color: timeLeft > 10 ? '#EAB308' : '#EF4444', fontWeight: 'bold', fontSize: '14px' }}>
                            {timeLeft > 0 ? `⏰ Time remaining: ${timeLeft}s` : '❌ OTP Expired'}
                        </div>

                        {message && message.type === 'error' && (
                            <div className={styles.msgError} style={{ padding: '8px', fontSize: '12px' }}>{message.text}</div>
                        )}
                        <div className={styles.btnGroup}>
                            <button className={styles.btnCancel} onClick={() => { setShowOtp(false); setMessage(null); }}>CANCEL</button>
                            <button className={styles.btnSubmit} style={{ marginTop: 0, flex: 2 }} onClick={submitTransfer} disabled={otpLoading || otpCode.length < 6 || timeLeft === 0}>
                                {otpLoading ? 'VERIFYING...' : 'VERIFY & TRANSFER'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {errorModalConfig && (
                <div className={styles.modalOverlay} style={{ zIndex: 1100 }}>
                    <div className={styles.modalContent} style={{ maxWidth: '420px', borderTop: '4px solid #EF4444' }}>
                        <h2 className={styles.modalTitle} style={{ color: '#EF4444' }}>Transfer Failed</h2>
                        
                        {errorModalConfig.type === 'INSUFFICIENT_FUNDS' && (
                            <div style={{ textAlign: 'left', margin: '20px 0', fontSize: '14px', lineHeight: '1.6' }}>
                                <p style={{ marginBottom: '16px', color: '#E2E8F0' }}>Insufficient funds for transfer.</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '8px', color: '#94A3B8' }}>
                                    <div>Available Balance:</div>
                                    <div style={{ textAlign: 'right', fontWeight: 'bold' }}>Rs.{Number(errorModalConfig.available).toLocaleString('en-IN')}</div>
                                    <div>Minimum Balance Required:</div>
                                    <div style={{ textAlign: 'right', fontWeight: 'bold' }}>Rs.1,000</div>
                                    <div>Maximum You Can Transfer:</div>
                                    <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#F8FAFC' }}>Rs.{Number(Math.max(0, errorModalConfig.available - 1000)).toLocaleString('en-IN')}</div>
                                </div>
                            </div>
                        )}

                        {errorModalConfig.type === 'FROZEN_RECEIVER' && (
                            <div style={{ textAlign: 'left', margin: '20px 0', fontSize: '14px', lineHeight: '1.6', color: '#E2E8F0' }}>
                                <p style={{ marginBottom: '12px' }}>Receiver account is not ACTIVE.</p>
                                <p style={{ marginBottom: '12px', color: '#94A3B8' }}>The destination account may be frozen or closed.</p>
                                <p style={{ color: '#94A3B8' }}>Please verify the account number and try again.</p>
                            </div>
                        )}

                        {errorModalConfig.type === 'SENDER_FROZEN' && (
                            <div style={{ textAlign: 'left', margin: '20px 0', fontSize: '14px', lineHeight: '1.6', color: '#E2E8F0' }}>
                                <p style={{ marginBottom: '12px', color: '#EF4444', fontWeight: 'bold' }}>Your account is FROZEN.</p>
                                <p style={{ marginBottom: '12px', color: '#94A3B8' }}>Account <strong>{errorModalConfig.accountId}</strong> cannot be used to initiate outbound transfers.</p>
                                <p style={{ color: '#94A3B8' }}>Please contact your branch manager to resolve this status.</p>
                            </div>
                        )}

                        <div className={styles.btnGroup} style={{ marginTop: '24px' }}>
                            <button 
                                className={styles.btnCancel} 
                                style={{ width: '100%', borderColor: '#475569', color: '#E2E8F0' }} 
                                onClick={() => setErrorModalConfig(null)}
                            >
                                {errorModalConfig.type === 'INSUFFICIENT_FUNDS' ? 'Try Again' : 'Go Back'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
