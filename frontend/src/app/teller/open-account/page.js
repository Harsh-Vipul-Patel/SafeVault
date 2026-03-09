'use client';
import { useState, useEffect } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function OpenAccount() {
    const [accountTypes, setAccountTypes] = useState([]);
    const [form, setForm] = useState({
        customerId: '', fullName: '', dob: '', pan: '', phone: '', email: '',
        address: '', typeId: '', initialDeposit: ''
    });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [newAccId, setNewAccId] = useState(null);

    useEffect(() => {
        // Load account types from backend
        fetch(`${API}/api/teller/account-types`, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then(r => r.json())
            .then(data => { if (data.types) setAccountTypes(data.types); })
            .catch(() => {
                // If API fails, handle error silently or set a specific UI error, but DO NOT load mock data.
                console.error("Failed to fetch account types from Oracle.");
            });
    }, []);

    const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.customerId || !form.typeId || !form.initialDeposit) {
            setMsg({ type: 'error', text: 'Customer ID, Account Type and Initial Deposit are required.' });
            return;
        }
        setLoading(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/teller/open-account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    customerId: form.customerId.trim(),
                    typeId: Number(form.typeId),
                    initialDeposit: Number(form.initialDeposit)
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `✓ ${data.message}` });
                if (data.accountId) setNewAccId(data.accountId);
                setForm({ customerId: '', fullName: '', dob: '', pan: '', phone: '', email: '', address: '', typeId: '', initialDeposit: '' });
            } else {
                setMsg({ type: 'error', text: data.message || 'Failed to open account.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network connection failed.' });
        }
        setLoading(false);
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '800px' }}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Open New Account</div>
                <div className={styles.headerSubtitle}>KYC Verification Required · Calls Oracle sp_open_account</div>
            </header>

            <form className={styles.formPanel} onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div className={styles.formGroup}>
                        <label>Customer ID (CID)</label>
                        <input type="text" className={styles.input} placeholder="e.g. CUST-001" value={form.customerId} onChange={set('customerId')} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Account Type</label>
                        <select className={styles.input} value={form.typeId} onChange={set('typeId')} required>
                            <option value="">— Select Type —</option>
                            {accountTypes.map(t => (
                                <option key={t.TYPE_ID || t.type_id} value={t.TYPE_ID || t.type_id}>
                                    {t.TYPE_NAME || t.type_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Initial Deposit (INR)</label>
                        <input type="number" className={styles.inputAmount} placeholder="₹ 1,000.00" min="1000" value={form.initialDeposit} onChange={set('initialDeposit')} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Full Name (For Reference)</label>
                        <input type="text" className={styles.input} placeholder="As per PAN / Aadhaar" value={form.fullName} onChange={set('fullName')} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>PAN Number</label>
                        <input type="text" className={styles.input} placeholder="ABCDE1234F" value={form.pan} onChange={set('pan')} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Phone Number</label>
                        <input type="tel" className={styles.input} placeholder="+91 98XXX XXXXX" value={form.phone} onChange={set('phone')} />
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Residential Address</label>
                    <input type="text" className={styles.input} placeholder="Full residential address" value={form.address} onChange={set('address')} />
                </div>

                {newAccId && (
                    <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '12px', color: '#10B981', fontFamily: 'DM Mono', letterSpacing: '0.1em' }}>ACCOUNT CREATED</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#F8FAFC', marginTop: '4px' }}>{newAccId}</div>
                    </div>
                )}

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <button type="submit" className={styles.btnPrimary} disabled={loading}>
                    {loading ? 'CREATING IN ORACLE…' : '🆕 CREATE ACCOUNT'}
                </button>
            </form>
        </div>
    );
}
