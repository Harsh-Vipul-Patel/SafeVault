'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        fullName: '',
        role: 'TELLER',
        branchId: '',
        employeeId: ''
    });

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setUsers(data.users || []);
        } catch {
            setMsg('Failed to fetch data from Oracle.');
        }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setBranches(data.branches || []);
        } catch {
            console.error('Failed to fetch branches');
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([fetchUsers(), fetchBranches()]);
            setLoading(false);
        };
        init();
    }, []);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg('✓ ' + data.message);
                setShowModal(false);
                setFormData({ username: '', password: '', fullName: '', role: 'TELLER', branchId: '', employeeId: '' });
                fetchUsers();
            } else {
                setMsg('Error: ' + data.message);
            }
        } catch {
            setMsg('Failed to onboard staff. Backend unreachable.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlock = async (userId) => {
        try {
            const res = await fetch(`${API}/api/admin/users/unlock/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (res.ok) {
                setMsg(`✓ ${data.message}`);
                fetchUsers();
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
                    <button className={styles.btnDanger} onClick={() => setShowModal(true)}>+ ADD STAFF</button>
                </div>
            </header>

            {msg && <div style={{
                background: msg.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: msg.includes('Error') ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)',
                color: msg.includes('Error') ? '#FCA5A5' : '#10B981',
                padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 600
            }}>{msg}</div>}

            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(10px)'
                }}>
                    <div style={{
                        background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', padding: '32px',
                        borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <h2 style={{ color: 'var(--grad-gold)', marginBottom: '4px', fontSize: '24px' }}>Onboard New Staff</h2>
                        <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>Provision system access and employee profiles</p>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
                            <div className={styles.inputGroup}>
                                <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>FULL NAME</label>
                                <input name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Firstname Lastname" required
                                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>EMPLOYEE ID</label>
                                    <input name="employeeId" value={formData.employeeId} onChange={handleChange} placeholder="EMP-MUM-T-22" required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>ROLE</label>
                                    <select name="role" value={formData.role} onChange={handleChange} required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(15,23,42,1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                                        <option value="TELLER">TELLER</option>
                                        <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
                                        <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                                        <option value="LOAN_MANAGER">LOAN_MANAGER</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>ASSIGN TO BRANCH</label>
                                <select name="branchId" value={formData.branchId} onChange={handleChange} required
                                    style={{ width: '100%', padding: '10px', background: 'rgba(15,23,42,1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                                    <option value="">Select Branch...</option>
                                    {branches.map(b => (
                                        <option key={b.branch_id} value={b.branch_id}>{b.branch_name} ({b.branch_code})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>USERNAME</label>
                                    <input name="username" value={formData.username} onChange={handleChange} placeholder="akash.roy" required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>PASSWORD</label>
                                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1 }}>
                                    {submitting ? 'COMMITTING TO ORACLE...' : 'CREATE IDENTITY'}
                                </button>
                                <button type="button" onClick={() => setShowModal(false)} className={styles.btnGhost} style={{ flex: 1 }}>CANCEL</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
