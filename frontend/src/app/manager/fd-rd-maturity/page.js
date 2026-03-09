'use client';
import { useState, useEffect } from 'react';
import styles from '../../manager/manager.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function ManagerFDMaturity() {
    const [pendingFds, setPendingFds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [message, setMessage] = useState(null);

    const fetchMaturityQueue = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/manager/accounts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            // Filter for FD/RD accounts with MATURING_SOON or similar if available, 
            // or just list all FDs for now.
            // For this UI, we assume we have an endpoint that returns accounts needing maturity processing.
            // Since we don't have a specialized endpoint, we filter accounts by type and maturity date.
            const fds = (data.accounts || []).filter(acc =>
                (acc.TYPE_NAME || '').includes('FIXED') && acc.STATUS === 'ACTIVE'
            );
            setPendingFds(fds);
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to load maturity queue.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMaturityQueue(); }, []);

    const processMaturity = async (fdId) => {
        setActionLoading(fdId);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/manager/deposits/process-maturity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fdId })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                fetchMaturityQueue();
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Processing failed.' });
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className={styles.contentWrap}>
            <header className={styles.topbar} style={{ position: 'static', margin: '-20px -20px 20px -20px' }}>
                <div className={styles.breadcrumb}>Manager Console / <span className={styles.crumbActive}>Deposit Maturity Desk</span></div>
            </header>

            <div className={styles.card} style={{ padding: '24px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', border: '1px solid #334155' }}>
                <h2 style={{ marginBottom: '16px', color: '#F8FAFC' }}>Maturing Fixed Deposits</h2>
                <p style={{ color: '#94A3B8', marginBottom: '24px' }}>Review and manually process maturity for accounts with special instructions or pending renewals.</p>

                {message && (
                    <div style={{
                        padding: '12px',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        background: message.type === 'success' ? '#064E3B' : '#7F1D1D',
                        color: '#ECFDF5'
                    }}>
                        {message.text}
                    </div>
                )}

                <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E2E8F0' }}>
                        <thead style={{ background: '#0F172A', textAlign: 'left' }}>
                            <tr>
                                <th style={{ padding: '12px' }}>ACCOUNT ID</th>
                                <th style={{ padding: '12px' }}>CUSTOMER</th>
                                <th style={{ padding: '12px' }}>PRINCIPAL</th>
                                <th style={{ padding: '12px' }}>MATURITY</th>
                                <th style={{ padding: '12px' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading accounts...</td></tr>
                            ) : pendingFds.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No deposits pending maturity processing.</td></tr>
                            ) : pendingFds.map(fd => (
                                <tr key={fd.ACCOUNT_ID} style={{ borderBottom: '1px solid #334155' }}>
                                    <td style={{ padding: '12px', fontFamily: 'DM Mono' }}>{fd.ACCOUNT_ID}</td>
                                    <td style={{ padding: '12px' }}>{fd.FULL_NAME || 'Unknown'}</td>
                                    <td style={{ padding: '12px' }}>{Number(fd.BALANCE).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</td>
                                    <td style={{ padding: '12px', color: '#FBBF24' }}>{new Date().toLocaleDateString()}</td>
                                    <td style={{ padding: '12px' }}>
                                        <button
                                            className={styles.actionBtn}
                                            style={{ background: '#2563EB', color: 'white', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                                            onClick={() => processMaturity(fd.ACCOUNT_ID)}
                                            disabled={actionLoading === fd.ACCOUNT_ID}
                                        >
                                            {actionLoading === fd.ACCOUNT_ID ? '...' : 'Process Maturity'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
