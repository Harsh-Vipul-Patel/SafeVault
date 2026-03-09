'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function BranchManagement() {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setBranches(data.branches || []);
            setLoading(false);
        } catch {
            setMsg('Failed to fetch branches from Oracle.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    if (loading) return <div className={styles.loading}>Loading Branch Data from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Branch Management</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchBranches}>↻ REFRESH</button>
                    <button className={styles.btnDanger}>+ NEW BRANCH</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Corporate Network (<code>BRANCHES</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1fr 2fr 1fr 2fr 1.5fr' }}>
                            <div>CODE</div><div>NAME</div><div>STATUS</div><div>LOCATION</div><div>MANAGER</div>
                        </div>
                        {branches.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No branches configured.</div>
                        ) : branches.map(b => {
                            const active = b.is_active === '1' || b.is_active === 1 || b.is_active === 'Y';
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1fr 2fr 1fr 2fr 1.5fr' }} key={b.branch_id}>
                                    <div className={styles.monoBlue}>{b.branch_code}</div>
                                    <div style={{ fontWeight: 600, color: '#E2E8F0' }}>{b.branch_name}</div>
                                    <div>
                                        {active ? (
                                            <span style={{ color: '#10B981', fontSize: '12px', fontWeight: 500, background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Operational</span>
                                        ) : (
                                            <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Closed</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{b.city}, {b.state}</div>
                                    <div style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>{b.manager_name || 'Unassigned'}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
