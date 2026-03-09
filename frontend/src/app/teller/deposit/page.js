'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CashDeposit() {
    const [acctId, setAcctId] = useState('');
    const [amount, setAmount] = useState('');
    const [denomNotes, setDenom] = useState('');
    const [accountInfo, setInfo] = useState(null);
    const [fetching, setFetching] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [newBalance, setNewBalance] = useState(null);

    const fetchAccount = async () => {
        if (!acctId.trim()) return;
        setFetching(true); setInfo(null); setMsg(null); setNewBalance(null);
        try {
            const res = await fetch(`${API}/api/teller/lookup?query=${encodeURIComponent(acctId.trim())}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setInfo(data.results[0]);
            } else {
                setMsg({ type: 'error', text: 'Account not found.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error. Is the backend running?' });
        }
        setFetching(false);
    };

    const handleDeposit = async () => {
        if (!acctId || !amount || Number(amount) <= 0) {
            setMsg({ type: 'error', text: 'Enter a valid account ID and amount.' });
            return;
        }
        setLoading(true); setMsg(null); setNewBalance(null);
        try {
            const res = await fetch(`${API}/api/teller/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ accountId: acctId.trim(), amount: Number(amount) })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `✓ ${data.message}  |  REF: ${data.ref}` });
                if (data.newBalance !== undefined) setNewBalance(data.newBalance);
                setAmount(''); setDenom('');
                // Re-fetch account info to show updated balance
                const res2 = await fetch(`${API}/api/teller/lookup?query=${encodeURIComponent(acctId.trim())}`, {
                    headers: { Authorization: `Bearer ${getToken()}` }
                });
                const data2 = await res2.json();
                if (data2.results?.length > 0) setInfo(data2.results[0]);
            } else {
                setMsg({ type: 'error', text: data.message || 'Deposit failed.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network connection failed. Check backend server.' });
        }
        setLoading(false);
    };

    const accId = accountInfo?.ACCOUNT_ID || accountInfo?.account_id;
    const name = accountInfo?.FULL_NAME || accountInfo?.full_name;
    const typN = accountInfo?.TYPE_NAME || accountInfo?.type_name || 'Account';
    const status = accountInfo?.STATUS || accountInfo?.status;
    const balance = accountInfo?.BALANCE || accountInfo?.balance;

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Cash Deposit</div>
                <div className={styles.headerSubtitle}>Terminal 04 · Calls Oracle sp_deposit atomically · Balance updated live</div>
            </header>

            <div className={styles.formPanel}>
                <div className={styles.formGroup}>
                    <label>Customer Account Number</label>
                    <div className={styles.lookupGroup}>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="e.g. ACC-MUM-003-8821"
                            value={acctId}
                            onChange={e => setAcctId(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchAccount()}
                        />
                        <button className={styles.btnSecondary} onClick={fetchAccount} disabled={fetching}>
                            {fetching ? '…' : 'FETCH DETAILS'}
                        </button>
                    </div>
                </div>

                {accountInfo && (
                    <div className={styles.fetchedDetails}>
                        <div className={styles.fdAvatar}>{(name || 'A')[0]}</div>
                        <div>
                            <div className={styles.fdName}>{name}</div>
                            <div className={styles.fdType}>
                                {typN} · <span style={{ color: status === 'ACTIVE' ? '#10B981' : '#EF4444' }}>{status}</span>
                                · Balance: ₹{Number(balance).toLocaleString('en-IN')}
                            </div>
                        </div>
                    </div>
                )}

                {newBalance !== null && (
                    <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', color: '#10B981', fontFamily: 'DM Mono', letterSpacing: '0.1em' }}>UPDATED BALANCE</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#10B981' }}>₹{Number(newBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                )}

                <div className={styles.formGroup}>
                    <label>Deposit Amount (INR)</label>
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
                    <label>Denomination Notes (Audit Trail)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. 500×10, 200×5, 100×20"
                        value={denomNotes}
                        onChange={e => setDenom(e.target.value)}
                    />
                </div>

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <button className={styles.btnPrimary} onClick={handleDeposit} disabled={loading || !acctId}>
                    {loading ? 'COMMITTING TO ORACLE…' : '✓ COMMIT DEPOSIT'}
                </button>
            </div>
        </div>
    );
}
