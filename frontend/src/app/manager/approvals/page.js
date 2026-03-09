'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ApprovalsQueue() {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('PENDING');

    useEffect(() => {
        fetchApprovals();
    }, [filter]);

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/approvals?status=${filter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch approvals');
            const data = await res.json();
            setQueue(data.queue || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (queueId, action) => {
        setActionLoading(queueId);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/approvals/${queueId}/${action}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ note: `${action}d via Manager Portal` })
            });
            if (!res.ok) throw new Error('Action failed');
            // Refresh list
            await fetchApprovals();
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const formatAmount = (payload) => {
        if (!payload) return '--';
        const amt = payload.amount || payload.p_amount;
        if (amt) return '₹ ' + Number(amt).toLocaleString('en-IN');
        return '--';
    };

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Dual Approval Queue</div>
                    <div className={styles.headerSubtitle}>Authorize high-value or sensitive operations initiated by Tellers</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
                        <button key={s}
                            className={filter === s ? styles.btnPrimary : styles.btnReject}
                            style={filter === s ? {} : { borderColor: 'rgba(255,255,255,0.2)', color: 'var(--cream)' }}
                            onClick={() => setFilter(s)}
                        >{s}</button>
                    ))}
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1fr 1.5fr 1.5fr 1fr 1.5fr' }}>
                        <div>REQ. ID</div>
                        <div>OPERATION</div>
                        <div>INITIATOR</div>
                        <div>AMOUNT</div>
                        <div style={{ textAlign: 'right' }}>ACTION</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading from Oracle...</div>
                    ) : queue.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No {filter.toLowerCase()} approvals in queue.</div>
                    ) : queue.map((req) => (
                        <div className={styles.tdRow} key={req.queueId} style={{ gridTemplateColumns: '1fr 1.5fr 1.5fr 1fr 1.5fr' }}>
                            <div className={styles.idMono}>{req.queueId ? req.queueId.substring(0, 8).toUpperCase() : 'N/A'}</div>
                            <div><span className={req.operationType?.includes('CLOSURE') || req.operationType?.includes('FREEZE') ? styles.opChipRed : styles.opChip}>{req.operationType || 'N/A'}</span></div>
                            <div>{req.requestedBy || 'System'}</div>
                            <div className={styles.tdAmount}>{formatAmount(req.payload)}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                {actionLoading === req.queueId ? (
                                    <span style={{ fontSize: '12px', color: 'var(--gold2)' }}>Processing...</span>
                                ) : filter === 'PENDING' ? (
                                    <>
                                        <button className={styles.btnApprove} onClick={() => handleAction(req.queueId, 'approve')}>APPROVE</button>
                                        <button className={styles.btnReject} onClick={() => handleAction(req.queueId, 'reject')}>REJECT</button>
                                    </>
                                ) : (
                                    <span style={{ fontSize: '12px', color: filter === 'APPROVED' ? '#3DD68C' : '#FF4A4A', fontWeight: 600 }}>{req.status}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
