'use client';
import { useState, useEffect } from 'react';
import styles from '../../admin/admin.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function AdminFeeManagement() {
    const [fees, setFees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [msg, setMsg] = useState(null);

    const fetchFees = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/admin/fees`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setFees(data.fees || []);
        } catch (err) {
            setMsg({ type: 'error', text: 'Error loading fee schedule.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFees(); }, []);

    const handleUpdate = async (fee) => {
        setActionLoading(fee.FEE_ID);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/admin/fees/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    feeId: fee.FEE_ID,
                    amount: fee.FEE_AMOUNT,
                    isPercentage: fee.IS_PERCENTAGE,
                    minBalanceThreshold: fee.MIN_BALANCE_THRESHOLD
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: `Fee ${fee.FEE_ID} updated successfully.` });
                fetchFees();
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Request failed.' });
        } finally {
            setActionLoading(null);
        }
    };

    const handleChange = (id, field, value) => {
        setFees(fees.map(f => f.FEE_ID === id ? { ...f, [field]: value } : f));
    };

    return (
        <div className={styles.contentWrap}>
            <header className={styles.topbar} style={{ position: 'static', margin: '-20px -20px 20px -20px' }}>
                <div className={styles.systemStatus}>🛡️ FEE ENGINE CONFIGURATION (Level 0)</div>
            </header>

            <div className={styles.card} style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1E293B' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ color: '#F8FAFC' }}>Service Charge & Fee Schedule</h2>
                    <button
                        className={styles.dangerBtn}
                        style={{ padding: '8px 16px', background: '#334155' }}
                        onClick={async () => {
                            const token = getToken();
                            await fetch(`${API}/api/admin/mis/run-fee-deduction`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            setMsg({ type: 'success', text: 'Global fee deduction job triggered.' });
                        }}
                    >
                        ⚡ Run Global Deduction Check
                    </button>
                </div>

                {msg && <div style={{ padding: '12px', borderRadius: '4px', marginBottom: '20px', background: msg.type === 'success' ? '#064E3B' : '#7F1D1D' }}>{msg.text}</div>}

                <div className={styles.tableWrap}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#CBD5E1' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', background: '#0F172A' }}>
                                <th style={{ padding: '12px' }}>FEE KEY</th>
                                <th style={{ padding: '12px' }}>DESCRIPTION</th>
                                <th style={{ padding: '12px' }}>AMOUNT/RATE</th>
                                <th style={{ padding: '12px' }}>UNIT</th>
                                <th style={{ padding: '12px' }}>MIN THRESHOLD</th>
                                <th style={{ padding: '12px' }}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Syncing with Fee Engine...</td></tr>
                            ) : fees.map(fee => (
                                <tr key={fee.FEE_ID} style={{ borderBottom: '1px solid #1E293B' }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{fee.FEE_ID}</td>
                                    <td style={{ padding: '12px', fontSize: '12px' }}>{fee.DESCRIPTION}</td>
                                    <td style={{ padding: '12px' }}>
                                        <input
                                            type="number"
                                            className={styles.input}
                                            style={{ width: '80px', padding: '4px' }}
                                            value={fee.FEE_AMOUNT}
                                            onChange={e => handleChange(fee.FEE_ID, 'FEE_AMOUNT', e.target.value)}
                                        />
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <select
                                            className={styles.input}
                                            style={{ width: '80px', padding: '4px' }}
                                            value={fee.IS_PERCENTAGE}
                                            onChange={e => handleChange(fee.FEE_ID, 'IS_PERCENTAGE', e.target.value)}
                                        >
                                            <option value="0">INR</option>
                                            <option value="1">%</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <input
                                            type="number"
                                            className={styles.input}
                                            style={{ width: '100px', padding: '4px' }}
                                            value={fee.MIN_BALANCE_THRESHOLD}
                                            onChange={e => handleChange(fee.FEE_ID, 'MIN_BALANCE_THRESHOLD', e.target.value)}
                                        />
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <button
                                            className={styles.dangerBtn}
                                            style={{ background: '#2563EB', padding: '6px 12px' }}
                                            onClick={() => handleUpdate(fee)}
                                            disabled={actionLoading === fee.FEE_ID}
                                        >
                                            {actionLoading === fee.FEE_ID ? '...' : 'Update'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
