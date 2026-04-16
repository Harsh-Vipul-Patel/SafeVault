'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function BranchManagement() {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        branchId: '', branchName: '', city: '', state: '', address: ''
    });
    const [editData, setEditData] = useState({
        branchId: '', branchName: '', ifscCode: '', city: '', state: '', address: ''
    });

    const fetchBranches = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setBranches(data.branches || []);
        } catch {
            setMsg('Failed to fetch branches from Oracle.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBranches(); }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleEditChange = (e) => setEditData({ ...editData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (res.ok) {
                const ifscNote = data.ifscCode ? ` IFSC: ${data.ifscCode}` : '';
                setMsg('✓ ' + data.message + ifscNote); setShowModal(false);
                setFormData({ branchId: '', branchName: '', city: '', state: '', address: '' });
                fetchBranches();
            } else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to create branch. Backend unreachable.'); }
        finally { setSubmitting(false); }
    };

    const handleEditClick = (branch) => {
        setEditData({
            branchId: branch.BRANCH_ID || branch.branch_id,
            branchName: branch.BRANCH_NAME || branch.branch_name || '',
            ifscCode: branch.IFSC_CODE || branch.BRANCH_CODE || branch.branch_code || '',
            city: branch.CITY || branch.city || '',
            state: branch.STATE || branch.state || '',
            address: branch.ADDRESS || branch.address || ''
        });
        setShowEditModal(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true); setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/branches/${editData.branchId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    branchName: editData.branchName,
                    address: editData.address,
                    city: editData.city,
                    state: editData.state
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg('✓ ' + data.message); setShowEditModal(false); fetchBranches();
            } else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to update branch.'); }
        finally { setSubmitting(false); }
    };

    const handleDeactivate = async (branchId) => {
        if (!confirm('Deactivate this branch? This will mark it as closed.')) return;
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/branches/${branchId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) { setMsg('✓ ' + data.message); fetchBranches(); }
            else setMsg('Error: ' + data.message);
        } catch { setMsg('Failed to deactivate branch.'); }
    };

    const inputStyle = {
        width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff'
    };
    const labelStyle = { color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' };

    const renderModal = (title, subtitle, data, onChange, onSubmit, onClose, submitLabel) => {
        const isEdit = title.includes('Edit');
        return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(10px)'
        }}>
            <div style={{
                background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', padding: '32px',
                borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <h2 style={{ color: 'var(--grad-gold)', marginBottom: '4px', fontSize: '24px' }}>{title}</h2>
                <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>{subtitle}</p>
                <form onSubmit={onSubmit} style={{ display: 'grid', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div><label style={labelStyle}>BRANCH ID</label>
                            <input name="branchId" value={data.branchId} onChange={onChange} required disabled={isEdit} placeholder="BRN-MUM-003" style={{ ...inputStyle, opacity: isEdit ? 0.5 : 1 }} />
                        </div>
                        <div><label style={labelStyle}>IFSC CODE</label>
                            <input
                                name="ifscCode"
                                value={isEdit ? (data.ifscCode || '') : 'AUTO-GENERATED'}
                                disabled
                                style={{ ...inputStyle, opacity: 0.7 }}
                            />
                        </div>
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '-8px' }}>
                        IFSC is generated automatically when branch is created and cannot be edited.
                    </div>
                    <div><label style={labelStyle}>BRANCH NAME</label>
                        <input name="branchName" value={data.branchName} onChange={onChange} required placeholder="Mumbai Central Node" style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div><label style={labelStyle}>CITY</label>
                            <input name="city" value={data.city} onChange={onChange} placeholder="Mumbai" style={inputStyle} />
                        </div>
                        <div><label style={labelStyle}>STATE</label>
                            <input name="state" value={data.state} onChange={onChange} placeholder="Maharashtra" style={inputStyle} />
                        </div>
                    </div>
                    <div><label style={labelStyle}>OFFICE ADDRESS</label>
                        <textarea name="address" value={data.address} onChange={onChange} placeholder="Street, landmark..." rows="2" style={{ ...inputStyle, resize: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                        <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1 }}>
                            {submitting ? 'COMMITTING TO ORACLE...' : submitLabel}
                        </button>
                        <button type="button" onClick={onClose} className={styles.btnGhost} style={{ flex: 1 }}>CANCEL</button>
                    </div>
                </form>
            </div>
        </div>
    );
    };

    if (loading) return <div className={styles.loading}>Loading Branch Data from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Branch Management</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchBranches}>↻ REFRESH</button>
                    <button className={styles.btnDanger} onClick={() => setShowModal(true)}>+ NEW BRANCH</button>
                </div>
            </header>

            {msg && <div style={{
                background: msg.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: msg.includes('Error') ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)',
                color: msg.includes('Error') ? '#FCA5A5' : '#10B981',
                padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px'
            }}>{msg}</div>}

            {showModal && renderModal('Configure New Branch', 'Register a new physical node in the corporate network', formData, handleChange, handleSubmit, () => setShowModal(false), 'AUTHORIZE BRANCH')}
            {showEditModal && renderModal('Edit Branch', 'Modify branch configuration in Oracle', editData, handleEditChange, handleEditSubmit, () => setShowEditModal(false), 'SAVE CHANGES')}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Corporate Network (<code>BRANCHES</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1fr 2fr 1fr 2fr 1.5fr 1.5fr' }}>
                            <div>CODE</div><div>NAME</div><div>STATUS</div><div>LOCATION</div><div>MANAGER</div><div>ACTIONS</div>
                        </div>
                        {branches.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No branches configured.</div>
                        ) : branches.map(b => {
                            const active = b.IS_ACTIVE === '1' || b.IS_ACTIVE === 1 || b.is_active === '1' || b.is_active === 1 || b.is_active === 'Y';
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1fr 2fr 1fr 2fr 1.5fr 1.5fr' }} key={b.BRANCH_ID || b.branch_id}>
                                    <div className={styles.monoBlue}>{b.IFSC_CODE || b.BRANCH_CODE || b.branch_code || '—'}</div>
                                    <div style={{ fontWeight: 600, color: '#E2E8F0' }}>{b.BRANCH_NAME || b.branch_name}</div>
                                    <div>
                                        {active ? (
                                            <span style={{ color: '#10B981', fontSize: '12px', fontWeight: 500, background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Operational</span>
                                        ) : (
                                            <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Closed</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{b.CITY || b.city}, {b.STATE || b.state}</div>
                                    <div style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>{b.MANAGER_NAME || b.manager_name || 'Unassigned'}</div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => handleEditClick(b)}
                                            style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                            EDIT
                                        </button>
                                        {active && (
                                            <button onClick={() => handleDeactivate(b.BRANCH_ID || b.branch_id)}
                                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                CLOSE
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
