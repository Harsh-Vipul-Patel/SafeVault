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
        username: '', password: '', fullName: '', role: 'TELLER', branchId: '', employeeId: ''
    });

    // Customer edit state (existing)
    const [showEditModal, setShowEditModal] = useState(false);
    const [editStep, setEditStep] = useState(1);
    const [editData, setEditData] = useState({ customerId: '', email: '', phone: '', address: '', userIdHex: '' });
    const [editOtp, setEditOtp] = useState('');

    // Employee edit state (new)
    const [showEmpEditModal, setShowEmpEditModal] = useState(false);
    const [empEditData, setEmpEditData] = useState({ userId: '', fullName: '', role: '', branchId: '' });

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setUsers(data.users || []);
        } catch { setMsg('Failed to fetch data from Oracle.'); }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setBranches(data.branches || []);
        } catch { console.error('Failed to fetch branches'); }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([fetchUsers(), fetchBranches()]);
            setLoading(false);
        };
        init();
    }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg('✓ ' + data.message); setShowModal(false);
                setFormData({ username: '', password: '', fullName: '', role: 'TELLER', branchId: '', employeeId: '' });
                fetchUsers();
            } else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to onboard staff. Backend unreachable.'); }
        finally { setSubmitting(false); }
    };

    const handleUnlock = async (userId) => {
        try {
            const res = await fetch(`${API}/api/admin/users/unlock/${userId}`, {
                method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) { setMsg(`✓ ${data.message}`); fetchUsers(); }
            else setMsg(data.message || 'Operation failed.');
        } catch { setMsg('Network error while applying to DB.'); }
        setTimeout(() => setMsg(null), 3000);
    };

    // --- CUSTOMER EDIT (existing OTP flow) ---
    const handleEditCustomerClick = async (userIdHex) => {
        try {
            setLoading(true);
            const res = await fetch(`${API}/api/admin/customers/${userIdHex}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok && data.customer) {
                setEditData({
                    customerId: data.customer.CUSTOMER_ID, userIdHex,
                    email: data.customer.EMAIL || '', phone: data.customer.PHONE || '',
                    address: data.customer.ADDRESS || ''
                });
                setEditStep(1); setShowEditModal(true);
            } else setMsg(data.message || 'Failed to fetch customer details');
        } catch { setMsg('Error fetching customer'); }
        finally { setLoading(false); }
    };

    const handleInitiateUpdate = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/customers/update-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ customerId: editData.customerId })
            });
            const data = await res.json();
            if (res.ok) { setEditStep(2); setMsg('OTP sent to customer.'); }
            else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to initiate update.'); }
        finally { setSubmitting(false); }
    };

    const handleConfirmUpdate = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const payload = { ...editData, otpCode: editOtp };
            const res = await fetch(`${API}/api/admin/customers/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) { setMsg('✓ ' + data.message); setShowEditModal(false); setEditOtp(''); fetchUsers(); }
            else setMsg('Error: ' + data.message);
        } catch { setMsg('Update failed.'); }
        finally { setSubmitting(false); }
    };

    // --- EMPLOYEE EDIT (new) ---
    const handleEditEmployeeClick = (user) => {
        setEmpEditData({
            userId: user.user_id,
            fullName: user.name || '',
            role: user.role || 'TELLER',
            branchId: ''
        });
        setShowEmpEditModal(true);
    };

    const handleEmpEditSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const body = {};
            if (empEditData.fullName) body.fullName = empEditData.fullName;
            if (empEditData.role) body.role = empEditData.role;
            if (empEditData.branchId) body.branchId = empEditData.branchId;

            const res = await fetch(`${API}/api/admin/users/${empEditData.userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) { setMsg('✓ ' + data.message); setShowEmpEditModal(false); fetchUsers(); }
            else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to update employee.'); }
        finally { setSubmitting(false); }
    };

    // --- EMPLOYEE DEACTIVATE (new) ---
    const handleDeactivateEmployee = async (userId) => {
        if (!confirm('Deactivate this employee? Their account will be locked.')) return;
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/users/${userId}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) { setMsg('✓ ' + data.message); fetchUsers(); }
            else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to deactivate employee.'); }
    };

    const inputStyle = {
        width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff'
    };
    const labelStyle = { color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' };
    const selectStyle = {
        width: '100%', padding: '10px', background: 'rgba(15,23,42,1)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff'
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

            {/* CREATE STAFF MODAL */}
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
                            <div><label style={labelStyle}>FULL NAME</label>
                                <input name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Firstname Lastname" required style={inputStyle} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                <div><label style={labelStyle}>EMPLOYEE ID</label>
                                    <input name="employeeId" value={formData.employeeId} onChange={handleChange} placeholder="EMP-MUM-T-22" required style={inputStyle} />
                                </div>
                                <div><label style={labelStyle}>ROLE</label>
                                    <select name="role" value={formData.role} onChange={handleChange} required style={selectStyle}>
                                        <option value="TELLER">TELLER</option>
                                        <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
                                        <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                                        <option value="LOAN_MANAGER">LOAN_MANAGER</option>
                                    </select>
                                </div>
                            </div>
                            <div><label style={labelStyle}>ASSIGN TO BRANCH</label>
                                <select name="branchId" value={formData.branchId} onChange={handleChange} required style={selectStyle}>
                                    <option value="">Select Branch...</option>
                                    {branches.map(b => (
                                        <option key={b.BRANCH_ID || b.branch_id} value={b.BRANCH_ID || b.branch_id}>
                                            {b.BRANCH_NAME || b.branch_name} ({b.IFSC_CODE || b.branch_code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div><label style={labelStyle}>USERNAME</label>
                                    <input name="username" value={formData.username} onChange={handleChange} placeholder="akash.roy" required style={inputStyle} />
                                </div>
                                <div><label style={labelStyle}>PASSWORD</label>
                                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required style={inputStyle} />
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

            {/* EDIT CUSTOMER MODAL (existing OTP flow) */}
            {showEditModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(10px)'
                }}>
                    <div style={{
                        background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', padding: '32px',
                        borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <h2 style={{ color: 'var(--grad-gold)', marginBottom: '4px', fontSize: '24px' }}>Edit Customer Profile</h2>
                        <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>Update profile via OTP verification</p>

                        {editStep === 1 ? (
                            <form onSubmit={handleInitiateUpdate} style={{ display: 'grid', gap: '16px' }}>
                                <div><label style={labelStyle}>EMAIL ADDRESS</label>
                                    <input value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} required style={inputStyle} />
                                </div>
                                <div><label style={labelStyle}>PHONE</label>
                                    <input value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} required style={inputStyle} />
                                </div>
                                <div><label style={labelStyle}>RESIDENTIAL ADDRESS</label>
                                    <textarea value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})} rows="3" required style={{ ...inputStyle, resize: 'vertical' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1, background: '#3b82f6' }}>
                                        {submitting ? 'SENDING OTP...' : 'REQUEST UPDATE (SEND OTP)'}
                                    </button>
                                    <button type="button" onClick={() => setShowEditModal(false)} className={styles.btnGhost} style={{ flex: 1 }}>CANCEL</button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleConfirmUpdate} style={{ display: 'grid', gap: '16px' }}>
                                <div><label style={labelStyle}>6-DIGIT OTP</label>
                                    <input value={editOtp} onChange={e => setEditOtp(e.target.value)} maxLength={6} required placeholder="123456"
                                        style={{ ...inputStyle, textAlign: 'center', letterSpacing: '4px', fontSize: '1.2rem' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1, background: '#10B981' }}>
                                        {submitting ? 'VERIFYING...' : 'VERIFY & SAVE'}
                                    </button>
                                    <button type="button" onClick={() => setShowEditModal(false)} className={styles.btnGhost} style={{ flex: 1 }}>CANCEL</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* EDIT EMPLOYEE MODAL (new) */}
            {showEmpEditModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(10px)'
                }}>
                    <div style={{
                        background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', padding: '32px',
                        borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <h2 style={{ color: 'var(--grad-gold)', marginBottom: '4px', fontSize: '24px' }}>Edit Employee</h2>
                        <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>Modify role, branch, or profile details</p>
                        <form onSubmit={handleEmpEditSubmit} style={{ display: 'grid', gap: '16px' }}>
                            <div><label style={labelStyle}>FULL NAME</label>
                                <input value={empEditData.fullName} onChange={e => setEmpEditData({...empEditData, fullName: e.target.value})} required style={inputStyle} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div><label style={labelStyle}>ROLE</label>
                                    <select value={empEditData.role} onChange={e => setEmpEditData({...empEditData, role: e.target.value})} style={selectStyle}>
                                        <option value="TELLER">TELLER</option>
                                        <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
                                        <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                                        <option value="LOAN_MANAGER">LOAN_MANAGER</option>
                                    </select>
                                </div>
                                <div><label style={labelStyle}>REASSIGN BRANCH</label>
                                    <select value={empEditData.branchId} onChange={e => setEmpEditData({...empEditData, branchId: e.target.value})} style={selectStyle}>
                                        <option value="">No change</option>
                                        {branches.map(b => (
                                            <option key={b.BRANCH_ID || b.branch_id} value={b.BRANCH_ID || b.branch_id}>
                                                {b.BRANCH_NAME || b.branch_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1, background: '#3b82f6' }}>
                                    {submitting ? 'SAVING...' : 'SAVE CHANGES'}
                                </button>
                                <button type="button" onClick={() => setShowEmpEditModal(false)} className={styles.btnGhost} style={{ flex: 1 }}>CANCEL</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* USERS TABLE */}
            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>System Identities (<code>USERS</code> / <code>EMPLOYEES</code> / <code>CUSTOMERS</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 1.5fr' }}>
                            <div>USERNAME</div><div>TYPE</div><div>PROFILE NAME</div><div>ROLE</div><div>STATUS</div><div>ACTIONS</div>
                        </div>
                        {users.map(u => {
                            const isLocked = u.is_locked === '1' || u.is_locked === 1;
                            const attempts = u.failed_attempts || 0;
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 1.5fr' }} key={u.user_id}>
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
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {isLocked && (
                                            <button onClick={() => handleUnlock(u.user_id)}
                                                style={{ background: '#EF4444', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                RESET LOGIN
                                            </button>
                                        )}
                                        {u.user_type === 'CUSTOMER' && (
                                            <button onClick={() => handleEditCustomerClick(u.user_id)}
                                                style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                EDIT
                                            </button>
                                        )}
                                        {u.user_type === 'EMPLOYEE' && !isLocked && (
                                            <>
                                                <button onClick={() => handleEditEmployeeClick(u)}
                                                    style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                    EDIT
                                                </button>
                                                <button onClick={() => handleDeactivateEmployee(u.user_id)}
                                                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                    DEACTIVATE
                                                </button>
                                            </>
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
