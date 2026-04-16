'use client';
import { useState, useEffect, useCallback } from 'react';
import styles from '../forms.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function TellerReports() {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [stats, setStats] = useState(null);
    const [txns, setTxns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);

    const fetchReport = useCallback(async () => {
        setLoading(true); setMsg(null); setStats(null); setTxns([]);
        try {
            const res = await fetch(`${API}/api/teller/daily-report?date=${date}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) {
                setStats(data.summary);
                setTxns(data.transactions || []);
            } else {
                setMsg({ type: 'error', text: data.message || 'Failed to load report.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error. Is the backend running?' });
        }
        setLoading(false);
    }, [date]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Branch Reports (Teller View)</div>
                <div className={styles.headerSubtitle}>Read-only · Your shift transaction count only</div>
            </header>

            {/* Filter Row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                    <label>Report Date</label>
                    <input
                        type="date"
                        className={styles.input}
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                </div>
                <button className={styles.btnSecondary} onClick={fetchReport} disabled={loading} style={{ height: '48px', padding: '0 24px' }}>
                    {loading ? '…' : 'LOAD REPORT'}
                </button>
            </div>

            {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

            {/* Summary Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    {[
                        { label: 'TOTAL DEPOSITS', value: formatINR(stats.totalDeposits), color: '#10B981' },
                        { label: 'TOTAL WITHDRAWALS', value: formatINR(stats.totalWithdrawals), color: '#EF4444' },
                        { label: 'TRANSACTIONS', value: stats.txnCount || 0, color: '#EAB308' },
                    ].map(c => (
                        <div key={c.label} style={{ background: '#1E2536', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '10px', color: '#64748B', fontFamily: 'DM Mono', letterSpacing: '0.1em', marginBottom: '8px' }}>{c.label}</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: c.color }}>{c.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Transactions Table */}
            {txns.length > 0 && (
                <div style={{ background: '#1E2536', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                {['TXN REF', 'ACCOUNT', 'TYPE', 'AMOUNT', 'TIME'].map(h => (
                                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#64748B', fontFamily: 'DM Mono', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {txns.map((t, i) => {
                                const ref = t.TRANSACTION_REF || t.transaction_ref;
                                const acc = t.ACCOUNT_ID || t.account_id;
                                const type = t.TRANSACTION_TYPE || t.transaction_type;
                                const amt = t.AMOUNT || t.amount;
                                const dt = t.TRANSACTION_DATE || t.transaction_date;
                                const isCredit = type?.includes('CREDIT');
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: '12px', color: '#94A3B8' }}>{ref}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#E2E8F0' }}>{acc}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#94A3B8' }}>{type}</td>
                                        <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: '14px', fontWeight: 700, color: isCredit ? '#10B981' : '#EF4444' }}>
                                            {isCredit ? '+' : '-'}{formatINR(amt)}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B' }}>
                                            {dt ? new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {stats && txns.length === 0 && (
                <div style={{ textAlign: 'center', color: '#64748B', padding: '40px', fontFamily: 'DM Mono', fontSize: '13px' }}>
                    No transactions for this date.
                </div>
            )}
        </div>
    );
}
