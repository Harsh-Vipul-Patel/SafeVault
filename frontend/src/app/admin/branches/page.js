'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function BranchManagement() {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        branchId: '',
        branchName: '',
        ifscCode: '',
        city: '',
        state: '',
        address: ''
    });

    const fetchBranches = async () => {
        setLoading(true);
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

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/admin/branches`, {
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
                setFormData({ branchId: '', branchName: '', ifscCode: '', city: '', state: '', address: '' });
                fetchBranches();
            } else {
                setMsg('Error: ' + data.message);
            }
        } catch {
            setMsg('Failed to create branch. Backend unreachable.');
        } finally {
            setSubmitting(false);
        }
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
                        <h2 style={{ color: 'var(--grad-gold)', marginBottom: '4px', fontSize: '24px' }}>Configure New Branch</h2>
                        <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>Register a new physical node in the corporate network</p>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>BRANCH ID</label>
                                    <input name="branchId" value={formData.branchId} onChange={handleChange} placeholder="BRN-MUM-003" required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>IFSC CODE</label>
                                    <input name="ifscCode" value={formData.ifscCode} onChange={handleChange} placeholder="SAFE0000003" required
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>BRANCH NAME</label>
                                <input name="branchName" value={formData.branchName} onChange={handleChange} placeholder="Mumbai Central Node" required
                                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>CITY</label>
                                    <input name="city" value={formData.city} onChange={handleChange} placeholder="Mumbai"
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>STATE</label>
                                    <input name="state" value={formData.state} onChange={handleChange} placeholder="Maharashtra"
                                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label style={{ color: '#94A3B8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>OFFICE ADDRESS</label>
                                <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Street, landmark..." rows="2"
                                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', resize: 'none' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="submit" disabled={submitting} className={styles.btnDanger} style={{ flex: 1 }}>
                                    {submitting ? 'COMMITTING TO ORACLE...' : 'AUTHORIZE BRANCH'}
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
