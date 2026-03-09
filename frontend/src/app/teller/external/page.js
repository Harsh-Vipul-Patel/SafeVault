'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function ExternalTransfer() {
    const [fromAccount, setFromAccount] = useState('');
    const [toAccount, setToAccount] = useState('');
    const [ifsc, setIfsc] = useState('');
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('NEFT');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);

    const handleTransfer = async () => {
        if (!fromAccount || !toAccount || !ifsc || !amount || Number(amount) <= 0) {
            setMsg({ type: 'error', text: 'All fields are required with a valid amount.' });
            return;
        }
        setLoading(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/teller/transfer/external`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ fromAccountId: fromAccount.trim(), toAccount, ifsc, mode, amount: Number(amount) })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `✓ ${data.message}  |  REF: ${data.ref}` });
                setAmount(''); setFromAccount(''); setToAccount(''); setIfsc('');
            } else {
                setMsg({ type: 'error', text: data.message || 'External transfer failed.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network connection failed. Is the backend running?' });
        }
        setLoading(false);
    };

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>External Transfer</div>
                <div className={styles.headerSubtitle}>Teller Terminal · NEFT / RTGS to other banks · Calls Oracle sp_initiate_external_transfer</div>
            </header>

            <div className={styles.formPanel}>
                <div className={styles.formGroup}>
                    <label>Source Account Number (Suraksha Bank)</label>
                    <input type="text" className={styles.input} placeholder="e.g. ACC-MUM-003-XXXX" value={fromAccount} onChange={e => setFromAccount(e.target.value)} />
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

                <div style={{ padding: '12px 16px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', fontSize: '12px', color: '#EAB308' }}>
                    ⚠ External transfers are queued in Oracle pending manager approval. A REF number will be assigned upon commit.
                </div>

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <button className={styles.btnPrimary} onClick={handleTransfer} disabled={loading}>
                    {loading ? 'COMMITTING TO ORACLE…' : 'INITIATE EXTERNAL TRANSFER ➔'}
                </button>
            </div>
        </div>
    );
}
