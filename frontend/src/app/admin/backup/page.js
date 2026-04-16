'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function BackupStatus() {
    const [storage, setStorage] = useState({ segments: [], totalMb: 0 });
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);

    const fetchBackup = async () => {
        try {
            const res = await fetch(`${API}/api/admin/backup`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setStorage(data || { segments: [], totalMb: 0 });
            setLoading(false);
        } catch {
            setMsg('Failed to fetch storage data from Oracle dictionary.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackup();
    }, []);

    if (loading) return <div className={styles.loading}>Pulling Oracle Segment Storage Data…</div>;

    const usedPct = Math.min((storage.totalMb / 1024) * 100, 100); // Dummy cap at 1GB for visual
    const barColor = usedPct > 80 ? '#EF4444' : usedPct > 50 ? '#F59E0B' : '#10B981';

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Backup & Storage Monitor</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchBackup}>↻ REFRESH</button>
                    <button className={styles.btnDanger} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC' }}>TRIGGER EXPORT</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Local Schema Storage (<code>USER_SEGMENTS</code>)</h2>
                    </div>

                    <div style={{ padding: '0 24px 24px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#E2E8F0', fontWeight: 600, fontSize: '14px' }}>
                            <span>Total Tablespace Allocated: {storage.totalMb} MB</span>
                        </div>
                        <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${usedPct}%`, height: '100%', background: barColor }} />
                        </div>
                    </div>

                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                            <div>SEGMENT/TABLE NAME</div><div>TYPE</div><div>SIZE (MB)</div>
                        </div>
                        {storage.segments.map((s, i) => (
                            <div className={styles.td} style={{ gridTemplateColumns: '2fr 1fr 1fr' }} key={i}>
                                <div style={{ fontFamily: 'DM Mono', fontWeight: 600, color: '#60A5FA' }}>{s.Table || s.TABLE}</div>
                                <div>
                                    <span style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: '#CBD5E1' }}>
                                        {s.Type || s.TYPE}
                                    </span>
                                </div>
                                <div style={{ fontFamily: 'DM Mono', color: '#F8FAFC' }}>{s['Size MB']} MB</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
