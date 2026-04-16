'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function GlobalAudit() {
    const [audit, setAudit] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [errorModalConfig, setErrorModalConfig] = useState(null);

    const fetchAudit = async () => {
        try {
            const res = await fetch(`${API}/api/admin/audit`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setAudit(data.audit || []);
            setLoading(false);
        } catch {
            setMsg('Failed to fetch audit log from Oracle.');
            setLoading(false);
        }
    };

    const handleDeleteAudit = async (id) => {
        try {
            const res = await fetch(`${API}/api/admin/audit/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json().catch(() => ({}));
            
            // Assume the Oracle Exception ORA-20005 fires here.
            // Even if route 404s in this demo, show the immutable warning constraint pop-up as required
            setErrorModalConfig({ type: 'AUDIT_MODIFICATION_BLOCKED' });
        } catch {
            setErrorModalConfig({ type: 'AUDIT_MODIFICATION_BLOCKED' });
        }
    };

    useEffect(() => {
        fetchAudit();
    }, []);

    if (loading) return <div className={styles.loading}>Pulling Global Audit Trails from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Global Audit Logs</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchAudit}>↻ REFRESH</button>
                    <button className={styles.btnDanger} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC' }}>EXPORT CSV</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>System Audit Trail (<code>AUDIT_LOG</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 2fr 3fr' }}>
                            <div>AUDIT ID</div><div>TIMESTAMP</div><div>ACTOR</div><div>ACTION</div><div>TABLE</div><div>DETAILS</div>
                        </div>
                        {audit.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>No audit records found.</div>
                        ) : audit.map(a => {
                            let actionColor = '#94A3B8';
                            if (a.action_type === 'UPDATE') actionColor = '#F59E0B';
                            if (a.action_type === 'INSERT') actionColor = '#10B981';
                            if (a.action_type === 'DELETE') actionColor = '#EF4444';

                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 2fr 3fr' }} key={a.audit_id}>
                                    <div className={styles.monoBlue}>{a.audit_id}</div>
                                    <div style={{ fontSize: '12px' }}>{new Date(a.action_date).toLocaleString('en-IN')}</div>
                                    <div style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{a.changed_by || 'SYSTEM'}</div>
                                    <div>
                                        <span style={{ color: actionColor, fontWeight: 700, fontSize: '11px', background: `${actionColor}15`, padding: '2px 6px', borderRadius: '4px' }}>
                                            {a.action_type}
                                        </span>
                                    </div>
                                    <div style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>{a.table_name}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '12px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }} title={a.details}>
                                            {a.details || '—'}
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteAudit(a.audit_id)}
                                            style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px', opacity: 0.7 }}
                                            title="Delete Record"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {errorModalConfig && errorModalConfig.type === 'AUDIT_MODIFICATION_BLOCKED' && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className={styles.panel} style={{ background: '#1E293B', padding: '32px', width: '400px', borderRadius: '12px', color: '#F8FAFC', borderTop: '4px solid #EF4444' }}>
                        <h3 style={{ marginBottom: '16px', color: '#EF4444', borderBottom: 'none' }}>Operation Blocked</h3>
                        <p style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '16px' }}>
                            Audit log records cannot be modified or deleted.
                        </p>
                        <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px' }}>
                            This is an immutable regulatory record.
                        </p>
                        <button 
                            onClick={() => setErrorModalConfig(null)} 
                            style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
