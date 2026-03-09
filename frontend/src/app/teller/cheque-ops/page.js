'use client';
import { useState } from 'react';
import styles from '../../teller/teller.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerChequeOps() {
    const [tab, setTab] = useState('ISSUE');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [form, setForm] = useState({ accountId: '', leaves: '25', chequeNo: '', amount: '', payee: '' });

    const handleAction = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ type: 'info', text: 'Processing request...' });
        try {
            const token = getToken();
            let endpoint = '';
            let payload = {};

            if (tab === 'ISSUE') {
                endpoint = '/api/teller/cheque/issue';
                payload = { accountId: form.accountId, leavesCount: form.leaves };
            } else if (tab === 'STOP') {
                endpoint = '/api/teller/cheque/stop';
                payload = { accountId: form.accountId, chequeNumber: form.chequeNo, reason: 'Stop Payment Requested by Customer' };
            } else if (tab === 'CLEAR') {
                endpoint = '/api/teller/cheque/clear';
                payload = { accountId: form.accountId, chequeNumber: form.chequeNo, amount: form.amount };
            }

            const res = await fetch(`${API}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            setMsg({ type: res.ok ? 'success' : 'error', text: data.message });
        } catch (err) {
            setMsg({ type: 'error', text: 'Action failed.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.dashboardContainer}>
            <header className={styles.sectionHeader}>
                <h1 className={styles.title}>Cheque Management Terminal</h1>
                <p className={styles.subtitle}>Issue, Clear, or Stop Cheque Payments</p>
            </header>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <button onClick={() => setTab('ISSUE')} className={tab === 'ISSUE' ? styles.btnPrimary : styles.btnSecondary}>Issue Cheque Book</button>
                <button onClick={() => setTab('CLEAR')} className={tab === 'CLEAR' ? styles.btnPrimary : styles.btnSecondary}>Clear Cheque</button>
                <button onClick={() => setTab('STOP')} className={tab === 'STOP' ? styles.btnPrimary : styles.btnSecondary}>Stop Payment</button>
            </div>

            <div className={styles.card} style={{ maxWidth: '600px' }}>
                <h2 className={styles.cardTitle}>{tab === 'ISSUE' ? 'Leaf Issuance' : tab === 'CLEAR' ? 'Clearing Entry' : 'Stop Instruction'}</h2>

                <form onSubmit={handleAction}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Account ID</label>
                        <input type="text" className={styles.input} value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} required />
                    </div>

                    {tab === 'ISSUE' && (
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Number of Leaves</label>
                            <select className={styles.input} value={form.leaves} onChange={e => setForm({ ...form, leaves: e.target.value })}>
                                <option value="25">25 Leaves</option>
                                <option value="50">50 Leaves</option>
                                <option value="100">100 Leaves</option>
                            </select>
                        </div>
                    )}

                    {(tab === 'STOP' || tab === 'CLEAR') && (
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Cheque Number</label>
                            <input type="text" className={styles.input} value={form.chequeNo} onChange={e => setForm({ ...form, chequeNo: e.target.value })} required />
                        </div>
                    )}

                    {tab === 'CLEAR' && (
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Clearing Amount</label>
                            <input type="number" className={styles.input} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                        </div>
                    )}

                    <button type="submit" className={styles.btnPrimary} style={{ width: '100%', marginTop: '24px' }} disabled={loading}>
                        {loading ? 'Processing...' : tab === 'ISSUE' ? 'Confirm Issuance' : tab === 'CLEAR' ? 'Execute Clearing' : 'Record Stop Payment'}
                    </button>
                </form>
            </div>

            {msg && <div className={msg.type === 'success' ? styles.successBanner : styles.errorBanner} style={{ marginTop: '24px', textAlign: 'center' }}>{msg.text}</div>}
        </div>
    );
}
