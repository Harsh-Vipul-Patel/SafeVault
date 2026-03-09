'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setUsers(data.users || []);
            setLoading(false);
        } catch {
            setMsg('Failed to fetch data from Oracle.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleUnlock = async (userId) => {
        try {
            const res = await fetch(`${API}/api/admin/users/unlock/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (res.ok) {
                setMsg(`✓ ${data.message}`);
                fetchUsers(); // Refresh live
            } else {
                setMsg(data.message || 'Operation failed.');
            }
        } catch {
            setMsg('Network error while applying to DB.');
        }
        setTimeout(() => setMsg(null), 3000);
    };

    if (loading) return <div className={styles.loading}>Loading Identity data from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>User & Role Management</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchUsers}>↻ REFRESH</button>
                    <button className={styles.btnDanger}>+ NEW USER</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 600 }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>System Identities (<code>USERS</code> / <code>EMPLOYEES</code> / <code>CUSTOMERS</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 1fr' }}>
                            <div>USERNAME</div><div>TYPE</div><div>PROFILE NAME</div><div>ROLE</div><div>STATUS</div><div>ACTIONS</div>
                        </div>
                        {users.map(u => {
                            const isLocked = u.is_locked === '1' || u.is_locked === 1;
                            const attempts = u.failed_attempts || 0;
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 1fr' }} key={u.user_id}>
                                    <div>{u.username}</div>
                                    <div style={{ fontFamily: 'DM Mono', fontSize: '12px', color: u.user_type === 'EMPLOYEE' ? '#D4A843' : '#94A3B8' }}>{u.user_type}</div>
                                    <div style={{ fontWeight: 600, color: '#E2E8F0' }}>{u.name || '—'}</div>
                                    <div>
                                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#CBD5E1' }}>
                                            {u.role}
                                        </span>
                                    </div>
                                    <div>
                                        {isLocked ? (
                                            <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 700 }}>LOCKED ({attempts})</span>
                                        ) : (
                                            <span style={{ color: '#10B981', fontSize: '12px', fontWeight: 500 }}>Active</span>
                                        )}
                                    </div>
                                    <div>
                                        {isLocked && (
                                            <button
                                                style={{ background: '#EF4444', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                                onClick={() => handleUnlock(u.user_id)}>
                                                RESET LOGIN
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
