'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function SettleTransfers() {
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('PENDING');

    useEffect(() => {
        fetchTransfers();
    }, [filter]);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/settlement?status=${filter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch transfers');
            const data = await res.json();
            setTransfers(data.transfers || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (transferId, action) => {
        setActionLoading(transferId);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/settlement/${transferId}/${action}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason: `${action}d via Manager Portal` })
            });
            if (!res.ok) throw new Error('Action failed');
            await fetchTransfers();
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Settle External Transfers</div>
                    <div className={styles.headerSubtitle}>Batch processing for NEFT/RTGS clearing</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['PENDING', 'SETTLED', 'REJECTED'].map(s => (
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
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr 1.2fr' }}>
                        <div>TRANSFER ID</div>
                        <div>BENEFICIARY</div>
                        <div>MODE</div>
                        <div>AMOUNT</div>
                        <div>SOURCE</div>
                        <div style={{ textAlign: 'right' }}>ACTION</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading from Oracle...</div>
                    ) : transfers.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No {filter.toLowerCase()} transfers.</div>
                    ) : transfers.map((t) => {
                        const tid = t.TRANSFER_ID ? (typeof t.TRANSFER_ID === 'string' ? t.TRANSFER_ID.substring(0, 12) : Buffer.from(t.TRANSFER_ID).toString('hex').substring(0, 12)) : 'N/A';
                        return (
                            <div className={styles.tdRow} key={t.TRANSFER_ID} style={{ gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr 1.2fr' }}>
                                <div className={styles.idMono}>{tid.toUpperCase()}</div>
                                <div>{t.DESTINATION_NAME || t.DESTINATION_IFSC} ({t.DESTINATION_ACCOUNT})</div>
                                <div className={styles.idMono}>{t.TRANSFER_MODE}</div>
                                <div className={styles.tdAmount}>₹ {Number(t.AMOUNT).toLocaleString('en-IN')}</div>
                                <div style={{ fontSize: '12px' }}>{t.SOURCE_ACCOUNT_ID}</div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    {actionLoading === t.TRANSFER_ID ? (
                                        <span style={{ fontSize: '12px', color: 'var(--gold2)' }}>Processing...</span>
                                    ) : filter === 'PENDING' ? (
                                        <>
                                            <button className={styles.btnApprove} style={{ padding: '6px 12px' }} onClick={() => handleAction(t.TRANSFER_ID, 'settle')}>Settle</button>
                                            <button className={styles.btnReject} style={{ padding: '6px 12px' }} onClick={() => handleAction(t.TRANSFER_ID, 'reject')}>Reject</button>
                                        </>
                                    ) : (
                                        <span style={{ fontSize: '12px', color: filter === 'SETTLED' ? '#3DD68C' : '#FF4A4A', fontWeight: 600 }}>{t.STATUS}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
