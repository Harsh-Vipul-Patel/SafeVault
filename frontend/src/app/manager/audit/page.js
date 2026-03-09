'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function BranchAuditLog() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateFilter, setDateFilter] = useState('');

    useEffect(() => {
        fetchAudit();
    }, [dateFilter]);

    const fetchAudit = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            let url = `${API}/api/manager/audit?limit=50`;
            if (dateFilter) url += `&date=${dateFilter}`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch audit log');
            const data = await res.json();
            setEntries(data.auditEntries || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return '--';
        const d = new Date(ts);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
            d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const exportCsv = () => {
        if (entries.length === 0) return;
        const headers = 'Timestamp,User,Operation,Table,Record ID,Details\n';
        const rows = entries.map(e =>
            `"${formatTimestamp(e.CHANGED_AT)}","${e.CHANGED_BY}","${e.OPERATION}","${e.TABLE_NAME}","${e.RECORD_ID}","${(e.CHANGE_REASON || '').replace(/"/g, '""')}"`
        ).join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'audit_log.csv'; a.click();
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Branch Audit Log</div>
                    <div className={styles.headerSubtitle}>Immutable record of all branch terminal operations — from Oracle AUDIT_LOG</div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <input type="date" className={styles.input} style={{ width: 'auto' }} value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
                    <button className={styles.btnReject} style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'var(--cream)' }} onClick={exportCsv}>Export CSV</button>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr 2fr 1fr' }}>
                        <div>TIMESTAMP</div>
                        <div>USER ID</div>
                        <div>ACTION TYPE</div>
                        <div>DETAILS</div>
                        <div>TABLE</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading audit log from Oracle...</div>
                    ) : entries.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No audit entries found{dateFilter ? ' for this date' : ''}.</div>
                    ) : entries.map((e) => (
                        <div className={styles.tdRow} key={e.AUDIT_ID} style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr 2fr 1fr' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatTimestamp(e.CHANGED_AT)}</div>
                            <div className={styles.idMono}>{e.CHANGED_BY}</div>
                            <div><span className={e.VIOLATION_FLAG === '1' ? styles.opChipRed : styles.opChip}>{e.OPERATION}</span></div>
                            <div style={{ fontSize: '12px' }}>{e.CHANGE_REASON || `${e.TABLE_NAME} → ${e.RECORD_ID}`}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{e.TABLE_NAME}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
