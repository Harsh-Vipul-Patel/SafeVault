'use client';
import { useState, useEffect } from 'react';
import styles from '../../teller/teller.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerServiceRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [msg, setMsg] = useState(null);
    const [resolution, setResolution] = useState('');

    const fetchPendingSRs = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/service-requests/pending`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to load service requests.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPendingSRs(); }, []);

    const handleResolve = async (srId, resolutionText) => {
        if (!resolutionText) {
            setMsg({ type: 'error', text: 'Please provide resolution remarks.' });
            return;
        }
        setActionLoading(srId);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/service-requests/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ srId, status: 'RESOLVED', notes: resolutionText })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'Request resolved successfully.' });
                setResolution('');
                fetchPendingSRs();
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to resolve request.' });
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className={styles.dashboardContainer}>
            <header className={styles.sectionHeader}>
                <h1 className={styles.title}>Service Request Queue</h1>
                <p className={styles.subtitle}>Manage and resolve customer service tickets</p>
            </header>

            {msg && <div className={msg.type === 'success' ? styles.successBanner : styles.errorBanner} style={{ marginBottom: '24px' }}>{msg.text}</div>}

            <div className={styles.tableWrap} style={{ marginTop: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E2E8F0' }}>
                    <thead style={{ background: '#0F172A', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>ID</th>
                            <th style={{ padding: '12px' }}>CUSTOMER</th>
                            <th style={{ padding: '12px' }}>TYPE</th>
                            <th style={{ padding: '12px' }}>DESCRIPTION</th>
                            <th style={{ padding: '12px' }}>RESOLUTION REMARKS</th>
                            <th style={{ padding: '12px' }}>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading queue...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No pending service requests.</td></tr>
                        ) : requests.map(sr => (
                            <tr key={sr.SR_ID} style={{ borderBottom: '1px solid #334155' }}>
                                <td style={{ padding: '12px', fontFamily: 'DM Mono' }}>{sr.SR_ID}</td>
                                <td style={{ padding: '12px' }}>{sr.CUSTOMER_NAME || 'ID: ' + sr.CUSTOMER_ID}</td>
                                <td style={{ padding: '12px' }}><span className={styles.statusPending}>{sr.REQUEST_TYPE}</span></td>
                                <td style={{ padding: '12px' }} title={sr.DESCRIPTION}>{sr.DESCRIPTION?.substring(0, 30)}...</td>
                                <td style={{ padding: '12px' }}>
                                    <input
                                        type="text"
                                        id={`res-${sr.SR_ID}`}
                                        className={styles.input}
                                        style={{ padding: '4px 8px' }}
                                        placeholder="Enter resolution..."
                                    />
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <button
                                        className={styles.btnPrimary}
                                        style={{ padding: '6px 12px' }}
                                        onClick={() => {
                                            const val = document.getElementById(`res-${sr.SR_ID}`).value;
                                            handleResolve(sr.SR_ID, val);
                                        }}
                                        disabled={actionLoading === sr.SR_ID}
                                    >
                                        {actionLoading === sr.SR_ID ? '...' : 'Resolve'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
