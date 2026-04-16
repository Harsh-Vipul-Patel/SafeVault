'use client';
import { useState, useEffect } from 'react';
import styles from '../manager.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function ManagerServiceRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [msg, setMsg] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/service-requests/pending`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to load requests.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRequests(); }, []);

    const handleResolve = async (srId, notes) => {
        if (!notes) {
            setMsg({ type: 'error', text: 'Please enter resolution notes.' });
            return;
        }
        setActionLoading(srId);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/service-requests/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ srId, status: 'RESOLVED', notes })
            });
            if (res.ok) {
                setMsg({ type: 'success', text: 'Request marked as resolved.' });
                fetchRequests();
            } else {
                const d = await res.json();
                setMsg({ type: 'error', text: d.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Network error resolving request.' });
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1 className={styles.panelTitle}>Service Request Management</h1>
            <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>Oversee and resolve branch service tickets (Chequebooks, etc.)</p>

            {msg && <div style={{
                padding: '12px', borderRadius: '8px', marginBottom: '20px',
                background: msg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: msg.type === 'success' ? '#10B981' : '#EF4444',
                border: '1px solid currentColor'
            }}>{msg.text}</div>}

            <div className={styles.tableWrap} style={{ background: '#141B2D', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E2E8F0' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px' }}>ID</th>
                            <th style={{ padding: '16px' }}>CUSTOMER</th>
                            <th style={{ padding: '16px' }}>TYPE</th>
                            <th style={{ padding: '16px' }}>DESCRIPTION</th>
                            <th style={{ padding: '16px' }}>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center' }}>Querying Oracle Service Queue...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>No pending service requests.</td></tr>
                        ) : requests.map(sr => (
                            <tr key={sr.SR_ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '16px', fontFamily: 'DM Mono' }}>{sr.SR_ID}</td>
                                <td style={{ padding: '16px' }}>{sr.CUSTOMER_ID}</td>
                                <td style={{ padding: '16px' }}><span style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(212,168,67,0.1)', color: '#D4A843', fontSize: '12px', fontWeight: 700 }}>{sr.REQUEST_TYPE}</span></td>
                                <td style={{ padding: '16px' }}>{sr.DESCRIPTION}</td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" id={`mgr-res-${sr.SR_ID}`} placeholder="Notes..." style={{ background: '#0D1321', border: '1px solid #334155', borderRadius: '4px', padding: '4px 8px', color: '#fff', fontSize: '13px' }} />
                                        <button
                                            onClick={() => handleResolve(sr.SR_ID, document.getElementById(`mgr-res-${sr.SR_ID}`).value)}
                                            disabled={actionLoading === sr.SR_ID}
                                            style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            {actionLoading === sr.SR_ID ? '...' : 'Resolve'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
