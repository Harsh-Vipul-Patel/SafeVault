'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CustomerStandingInstructions() {
    const [instructions, setInstructions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        frequency: 'MONTHLY',
        nextRun: ''
    });
    const [msg, setMsg] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const [instRes, accRes] = await Promise.all([
                fetch(`${API}/api/customer/standing-instructions`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API}/api/customer/accounts`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            const instData = await instRes.json();
            const accData = await accRes.json();
            setInstructions(instData.instructions || []);
            setAccounts(accData.accounts || []);
            if (accData.accounts?.length > 0) {
                setForm(f => ({ ...f, fromAccountId: accData.accounts[0].ACCOUNT_ID }));
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Error loading data.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        setMsg({ type: 'info', text: 'Setting up instruction...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/standing-instructions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'Standing Instruction created successfully!' });
                setShowAdd(false);
                fetchData();
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to create instruction.' });
        }
    };

    if (loading && instructions.length === 0) return <div className={styles.loadingState}>Loading instructions...</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Standing Instructions</h1>
                <button className={styles.btnPrimary} onClick={() => setShowAdd(!showAdd)}>
                    {showAdd ? 'Cancel' : '+ New Instruction'}
                </button>
            </header>

            {msg && <div className={msg.type === 'error' ? styles.errorBanner : styles.successBanner} style={{ marginBottom: '24px' }}>{msg.text}</div>}

            {showAdd && (
                <div className={styles.tableContainer} style={{ padding: '24px', marginBottom: '2rem' }}>
                    <h2 className={styles.tableTitle}>Automation Setup</h2>
                    <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>From Account</label>
                            <select className={styles.input} value={form.fromAccountId} onChange={e => setForm({ ...form, fromAccountId: e.target.value })}>
                                {accounts.map(a => <option key={a.ACCOUNT_ID} value={a.ACCOUNT_ID}>{a.TYPE_NAME} - {a.ACCOUNT_ID}</option>)}
                            </select>
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>To Account ID (Internal)</label>
                            <input type="text" className={styles.input} value={form.toAccountId} onChange={e => setForm({ ...form, toAccountId: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Amount</label>
                            <input type="number" className={styles.input} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Frequency</label>
                            <select className={styles.input} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="QUARTERLY">Quarterly</option>
                            </select>
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>First Run Date</label>
                            <input type="date" className={styles.input} value={form.nextRun} onChange={e => setForm({ ...form, nextRun: e.target.value })} required />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px', marginTop: '16px' }}>
                            <button type="submit" className={styles.btnPrimary} style={{ flex: 1 }}>Set Automation</button>
                            <button type="button" className={styles.btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Active Instructions</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>FROM ACCOUNT</th>
                            <th>TO ACCOUNT</th>
                            <th>AMOUNT</th>
                            <th>FREQUENCY</th>
                            <th>NEXT RUN</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {instructions.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No active standing instructions.</td></tr>
                        ) : instructions.map((ins, i) => (
                            <tr key={ins.INSTRUCTION_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{ins.INSTRUCTION_ID}</td>
                                <td>{ins.DEBIT_ACCOUNT_ID}</td>
                                <td>{ins.CREDIT_REFERENCE}</td>
                                <td className={styles.amtNegative}>{formatINR(ins.AMOUNT)}</td>
                                <td>{ins.FREQUENCY}</td>
                                <td>{new Date(ins.NEXT_EXECUTION_DATE).toLocaleDateString()}</td>
                                <td><span className={styles.statusDone}>{ins.STATUS}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
