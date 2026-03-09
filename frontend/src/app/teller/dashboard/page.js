'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function TellerDashboard() {
    const [queue, setQueue] = useState([]);
    const [stats, setStats] = useState({ queueLen: 0, txnToday: 0, totalDeposits: 0, totalWithdrawals: 0 });
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [servedMsg, setServedMsg] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    // --- Add to Queue modal ---
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState('');
    const [newService, setNewService] = useState('Cash Deposit');
    const [newPriority, setNewPriority] = useState(2);
    const [addLoading, setAddLoading] = useState(false);

    const fetchQueue = async () => {
        try {
            const res = await fetch(`${API}/api/teller/queue`, { headers: { Authorization: `Bearer ${getToken()}` } });
            const data = await res.json();
            setQueue(data.queue || []);
            setStats(s => ({ ...s, queueLen: (data.queue || []).length }));
        } catch {
            setQueue([]);
            setStats(s => ({ ...s, queueLen: 0 }));
        }
        setLoadingQueue(false);
    };

    const fetchStats = async () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const res = await fetch(`${API}/api/teller/daily-report?date=${today}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok && data.summary) {
                setStats(s => ({
                    ...s,
                    txnToday: data.summary.txnCount,
                    totalDeposits: data.summary.totalDeposits,
                    totalWithdrawals: data.summary.totalWithdrawals
                }));
            }
        } catch { }
    };

    useEffect(() => {
        fetchQueue();
        fetchStats();
        const interval = setInterval(() => { fetchQueue(); fetchStats(); }, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleServe = async (queueId, tokenNumber) => {
        setActionLoading(queueId);
        try {
            const res = await fetch(`${API}/api/teller/serve-queue/${queueId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                setServedMsg(`Token ${tokenNumber} marked as Served.`);
                setTimeout(() => setServedMsg(null), 3000);
                await fetchQueue();
            } else {
                const data = await res.json();
                setServedMsg(data.message || 'Failed to serve.');
                setTimeout(() => setServedMsg(null), 3000);
            }
        } catch {
            setServedMsg('Network error. Is the backend running?');
            setTimeout(() => setServedMsg(null), 3000);
        }
        setActionLoading(null);
    };

    const handleAddToQueue = async () => {
        if (!newCustomer.trim()) return;
        setAddLoading(true);
        try {
            const res = await fetch(`${API}/api/teller/submit-queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ customerName: newCustomer, serviceType: newService, priority: newPriority })
            });
            if (res.ok) {
                setShowAddModal(false);
                setNewCustomer('');
                setNewService('Cash Deposit');
                setNewPriority(2);
                await fetchQueue();
            }
        } catch { }
        setAddLoading(false);
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.pageTitle}>Counter Operations — Mumbai Central</h1>

            {servedMsg && (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                    ✓ {servedMsg}
                </div>
            )}

            {/* STATS ROW */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>QUEUE LENGTH</div>
                    <div className={styles.statValue}>{stats.queueLen}</div>
                    <div className={styles.statSub}>Customers waiting</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>TODAY&apos;S TRANSACTIONS</div>
                    <div className={styles.statValue}>{stats.txnToday}</div>
                    <div className={styles.statSub}>From Oracle DB (live)</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>TOTAL DEPOSITS TODAY</div>
                    <div className={styles.statValue} style={{ fontSize: '20px', color: '#10B981' }}>
                        {formatINR(stats.totalDeposits)}
                    </div>
                    <div className={styles.statSub}>Credits processed</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>TOTAL WITHDRAWALS</div>
                    <div className={styles.statValue} style={{ fontSize: '20px', color: '#EF4444' }}>
                        {formatINR(stats.totalWithdrawals)}
                    </div>
                    <div className={styles.statSub}>Debits processed</div>
                </div>
            </div>

            {/* QUEUE TABLE */}
            <div className={styles.queueCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Service Queue {loadingQueue ? '(Loading…)' : `(${queue.length})`}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setShowAddModal(true)} style={{ background: 'linear-gradient(135deg, #D4A843, #B8860B)', border: 'none', color: '#0D1321', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                            + Add Customer
                        </button>
                        <button onClick={fetchQueue} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                            ↻ Refresh
                        </button>
                    </div>
                </div>
                <table className={styles.queueTable}>
                    <thead>
                        <tr>
                            <th>TOKEN</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>PRIORITY</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {queue.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>No customers in queue.</td></tr>
                        ) : queue.map((row) => {
                            const queueId = row.QUEUE_ID || row.queue_id;
                            const token = row.TOKEN_NUMBER || row.token_number;
                            const name = row.CUSTOMER_NAME || row.customer_name;
                            const service = row.SERVICE_TYPE || row.service_type;
                            const priority = row.PRIORITY || row.priority;
                            return (
                                <tr key={queueId}>
                                    <td className={styles.tokenCell}>{token}</td>
                                    <td>{name}</td>
                                    <td>{service}</td>
                                    <td>
                                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, background: priority === 1 ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: priority === 1 ? '#EF4444' : '#EAB308' }}>
                                            {priority === 1 ? 'HIGH' : 'NORMAL'}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            className={priority === 1 ? styles.btnHighValue : styles.btnServe}
                                            onClick={() => handleServe(queueId, token)}
                                            disabled={actionLoading === queueId}
                                        >
                                            {actionLoading === queueId ? '…' : 'Serve'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ADD TO QUEUE MODAL */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}
                    onClick={() => setShowAddModal(false)}>
                    <div style={{ background: '#141B2D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px', width: '400px', maxWidth: '90vw' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ color: '#E2E8F0', marginBottom: '24px', fontSize: '16px', fontWeight: 700 }}>Add Customer to Queue</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em', display: 'block', marginBottom: '6px' }}>CUSTOMER NAME</label>
                                <input type="text" value={newCustomer} onChange={e => setNewCustomer(e.target.value)}
                                    placeholder="e.g. Ravi Verma"
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '14px', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em', display: 'block', marginBottom: '6px' }}>SERVICE TYPE</label>
                                <select value={newService} onChange={e => setNewService(e.target.value)}
                                    style={{ width: '100%', background: '#0D1321', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '14px', outline: 'none' }}>
                                    <option>Cash Deposit</option>
                                    <option>Cash Withdrawal</option>
                                    <option>Open New Account</option>
                                    <option>NEFT Transfer</option>
                                    <option>RTGS Transfer</option>
                                    <option>Account Inquiry</option>
                                    <option>Cheque Deposit</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'DM Mono, monospace', letterSpacing: '0.1em', display: 'block', marginBottom: '6px' }}>PRIORITY</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button onClick={() => setNewPriority(1)}
                                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: newPriority === 1 ? '2px solid #EF4444' : '1px solid rgba(255,255,255,0.1)', background: newPriority === 1 ? 'rgba(239,68,68,0.1)' : 'transparent', color: newPriority === 1 ? '#EF4444' : '#94A3B8', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                                        HIGH
                                    </button>
                                    <button onClick={() => setNewPriority(2)}
                                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: newPriority === 2 ? '2px solid #EAB308' : '1px solid rgba(255,255,255,0.1)', background: newPriority === 2 ? 'rgba(234,179,8,0.1)' : 'transparent', color: newPriority === 2 ? '#EAB308' : '#94A3B8', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                                        NORMAL
                                    </button>
                                </div>
                            </div>
                            <button onClick={handleAddToQueue} disabled={addLoading || !newCustomer.trim()}
                                style={{ marginTop: '8px', padding: '12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #D4A843, #B8860B)', color: '#0D1321', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: addLoading || !newCustomer.trim() ? 0.5 : 1 }}>
                                {addLoading ? 'Adding…' : '+ ADD TO QUEUE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QUICK ACTIONS */}
            <div className={styles.quickActions}>
                <Link href="/teller/deposit" className={styles.btnQuickDeposit}>💰 Quick Deposit</Link>
                <Link href="/teller/withdraw" className={styles.btnQuickWithdraw}>💸 Quick Withdrawal</Link>
                <Link href="/teller/open-account" className={styles.btnQuickAccount}>🆕 Open Account</Link>
                <Link href="/teller/lookup" className={styles.btnQuickAccount} style={{ background: 'linear-gradient(135deg, #1A6B5A, #0F4237)' }}>🔍 Customer Lookup</Link>
            </div>
        </div>
    );
}
