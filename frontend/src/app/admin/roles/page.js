'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function RolesPermissions() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchRoles = async () => {
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            console.log('Roles Page: Received users:', data.users);
            // Filter to just EMPLOYEES (Robust Match)
            const employees = (data.users || []).filter(u =>
                u.user_type?.trim().toUpperCase() === 'EMPLOYEE'
            );
            console.log('Roles Page: Filtered employees:', employees);
            setUsers(employees);
            setLoading(false);
        } catch (err) {
            console.error('Roles Page: Fetch error:', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    if (loading) return <div className={styles.loading}>Pulling Employee Roles from Oracle…</div>;

    const roleGroups = users.reduce((acc, u) => {
        const r = u.role || 'UNASSIGNED';
        acc[r] = (acc[r] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Role & Permissions Explorer</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchRoles}>↻ REFRESH</button>
                    <button className={styles.btnDanger}>EDIT MATRIX</button>
                </div>
            </header>

            <div className={styles.telemetryGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '32px' }}>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>SYSTEM_ADMIN <span className={styles.resValue}>{roleGroups['SYSTEM_ADMIN'] || 0}</span></div>
                </div>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>BRANCH_MANAGER <span className={styles.resValue}>{roleGroups['BRANCH_MANAGER'] || 0}</span></div>
                </div>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>TELLER <span className={styles.resValue}>{roleGroups['TELLER'] || 0}</span></div>
                </div>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>IT_SUPPORT <span className={styles.resValue}>{roleGroups['IT_SUPPORT'] || 0}</span></div>
                </div>
            </div>

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Internal Personnel Access (<code>EMPLOYEES</code> table mapping)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1.5fr 2fr 2fr' }}>
                            <div>USERNAME</div><div>EMPLOYEE NAME</div><div>ASSIGNED ROLE</div>
                        </div>
                        {users.map(u => (
                            <div className={styles.td} style={{ gridTemplateColumns: '1.5fr 2fr 2fr' }} key={u.user_id}>
                                <div className={styles.monoBlue}>{u.username}</div>
                                <div style={{ fontWeight: 600, color: '#E2E8F0' }}>{u.name || '—'}</div>
                                <div>
                                    <span style={{
                                        color: u.role === 'SYSTEM_ADMIN' ? '#EF4444' : u.role === 'BRANCH_MANAGER' ? '#F59E0B' : '#10B981',
                                        background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600
                                    }}>
                                        {u.role || 'UNASSIGNED'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
