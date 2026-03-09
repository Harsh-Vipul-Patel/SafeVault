'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function AccountLifecycle() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (accountId, newStatus) => {
        setActionLoading(accountId);
        setSuccess(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/accounts/${accountId}/status`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ newStatus, reason: `Status changed to ${newStatus} via Manager Portal` })
            });
            if (!res.ok) throw new Error('Status change failed');
            const data = await res.json();
            setSuccess(data.message);
            await fetchAccounts();
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const statusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#3DD68C';
            case 'FROZEN': return '#5B9BFF';
            case 'CLOSED': return '#FF4A4A';
            case 'DORMANT': return '#FFAB6E';
            default: return 'var(--muted)';
        }
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Account Lifecycle Management</div>
                    <div className={styles.headerSubtitle}>Freeze, Close, or Update account statuses — all changes are audited in Oracle</div>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ color: '#3DD68C', fontSize: '13px', padding: '12px 16px', background: 'rgba(61,214,140,0.1)', borderRadius: '8px', marginBottom: '16px' }}>{success}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1.2fr 1.5fr 1fr 1fr 0.8fr 1.5fr' }}>
                        <div>ACCOUNT ID</div>
                        <div>CUSTOMER</div>
                        <div>TYPE</div>
                        <div>BALANCE</div>
                        <div>STATUS</div>
                        <div style={{ textAlign: 'right' }}>ACTIONS</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading accounts from Oracle...</div>
                    ) : accounts.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No accounts found for this branch.</div>
                    ) : accounts.map((a) => (
                        <div className={styles.tdRow} key={a.ACCOUNT_ID} style={{ gridTemplateColumns: '1.2fr 1.5fr 1fr 1fr 0.8fr 1.5fr' }}>
                            <div className={styles.idMono}>{a.ACCOUNT_ID}</div>
                            <div>{a.CUSTOMER_NAME}</div>
                            <div style={{ fontSize: '12px' }}>{a.TYPE_NAME}</div>
                            <div className={styles.tdAmount}>₹ {Number(a.BALANCE).toLocaleString('en-IN')}</div>
                            <div><span style={{ color: statusColor(a.STATUS), fontWeight: 600, fontSize: '12px' }}>{a.STATUS}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                {actionLoading === a.ACCOUNT_ID ? (
                                    <span style={{ fontSize: '12px', color: 'var(--gold2)' }}>Updating...</span>
                                ) : (
                                    <>
                                        {a.STATUS !== 'ACTIVE' && (
                                            <button className={styles.btnApprove} style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => handleStatusChange(a.ACCOUNT_ID, 'ACTIVE')}>ACTIVATE</button>
                                        )}
                                        {a.STATUS !== 'FROZEN' && a.STATUS !== 'CLOSED' && (
                                            <button className={styles.btnReject} style={{ padding: '6px 10px', fontSize: '11px', borderColor: '#5B9BFF', color: '#5B9BFF' }} onClick={() => handleStatusChange(a.ACCOUNT_ID, 'FROZEN')}>FREEZE</button>
                                        )}
                                        {a.STATUS !== 'CLOSED' && (
                                            <button className={styles.btnReject} style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => handleStatusChange(a.ACCOUNT_ID, 'CLOSED')}>CLOSE</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
