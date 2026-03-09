'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CustomerChequeRequest() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ accountId: '', leaves: '25' });
    const [msg, setMsg] = useState(null);

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
        setMsg({ type: 'info', text: 'Submitting request...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/cheque/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ accountId: form.accountId, leavesCount: form.leaves })
            });
            const data = await res.json();
            setMsg({ type: res.ok ? 'success' : 'error', text: data.message });
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to submit request.' });
        }
    };

    if (loading) return <div className={styles.loadingState}>Loading accounts...</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Request Cheque Book</h1>
                <Link href="/customer/dashboard" className={styles.viewAllLink}>← Back to Dashboard</Link>
            </header>

            <div className={styles.summaryCard} style={{ maxWidth: '600px', margin: '0 auto', background: 'rgba(255,255,255,0.03)' }}>
                {msg && <div className={msg.type === 'error' ? styles.errorBanner : styles.successBanner} style={{ marginBottom: '20px' }}>{msg.text}</div>}

                <form onSubmit={handleSubmit}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Select Account</label>
                        <select className={styles.input} value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}>
                            {accounts.map(a => <option key={a.ACCOUNT_ID} value={a.ACCOUNT_ID}>{a.TYPE_NAME} - {a.ACCOUNT_ID}</option>)}
                        </select>
                    </div>

                    <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
                        <label className={styles.label}>Number of Leaves</label>
                        <select className={styles.input} value={form.leaves} onChange={e => setForm({ ...form, leaves: e.target.value })}>
                            <option value="25">25 Leaves (Standard)</option>
                            <option value="50">50 Leaves (+ ₹100 Charge)</option>
                            <option value="100">100 Leaves (+ ₹250 Charge)</option>
                        </select>
                    </div>

                    <button type="submit" className={styles.btnPrimary} style={{ width: '100%', marginTop: '24px' }}>
                        Submit Request
                    </button>

                    <p style={{ marginTop: '16px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>
                        Your cheque book will be dispatched to your registered address within 5-7 working days after verification.
                    </p>
                </form>
            </div>

            <div className={styles.actionsRow} style={{ marginTop: '2rem' }}>
                <div className={styles.summaryCard} style={{ width: '100%', maxWidth: 'none', border: '1px solid #1E293B' }}>
                    <h3 style={{ color: '#F8FAFC', marginBottom: '8px' }}>Stop Payment?</h3>
                    <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '12px' }}>
                        Need to stop a lost or stolen cheque? Contact customer support immediately or visit your branch.
                    </p>
                    <Link href="/customer/support" className={styles.btnSecondary} style={{ display: 'inline-block' }}>Contact Branch</Link>
                </div>
            </div>
        </div>
    );
}
