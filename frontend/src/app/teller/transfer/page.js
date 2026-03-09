'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function FundTransfer() {
    const [fromAccount, setFromAccount] = useState('');
    const [toAccount, setToAccount] = useState('');
    const [amount, setAmount] = useState('');
    const [desc, setDesc] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);

    const handleTransfer = async () => {
        if (!fromAccount || !toAccount || !amount || Number(amount) <= 0) {
            setMsg({ type: 'error', text: 'All fields are required.' });
            return;
        }
        if (fromAccount.trim() === toAccount.trim()) {
            setMsg({ type: 'error', text: 'Source and destination accounts cannot be the same.' });
            return;
        }
        setLoading(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/teller/transfer/internal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    fromAccountId: fromAccount.trim(),
                    toAccountId: toAccount.trim(),
                    amount: Number(amount)
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `✓ ${data.message}  |  REF: ${data.ref}` });
                setAmount(''); setFromAccount(''); setToAccount(''); setDesc('');
            } else {
                setMsg({ type: 'error', text: data.message || 'Transfer failed.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network connection failed. Check backend server.' });
        }
        setLoading(false);
    };

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Fund Transfer (Internal)</div>
                <div className={styles.headerSubtitle}>Terminal 04 · Calls sp_internal_transfer with SERIALIZABLE isolation</div>
            </header>

            <div className={styles.formPanel}>
                <div className={styles.formGroup}>
                    <label>From Account (Source)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. ACC-MUM-003-8821"
                        value={fromAccount}
                        onChange={e => setFromAccount(e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>To Account (Destination)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. ACC-MUM-003-1029"
                        value={toAccount}
                        onChange={e => setToAccount(e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Transfer Amount (INR)</label>
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
                    <label>Remarks (Optional)</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="Transfer reason..."
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                    />
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', fontSize: '12px', color: '#EAB308' }}>
                    ⚠ High-value transfers (&gt; ₹2,00,000) are automatically escalated to DUAL_APPROVAL_QUEUE and require manager approval.
                </div>

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <button className={styles.btnPrimary} onClick={handleTransfer} disabled={loading}>
                    {loading ? 'COMMITTING TO ORACLE…' : '🔄 PROCESS TRANSFER'}
                </button>
            </div>
        </div>
    );
}
