'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CustomerServiceRequests() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ type: 'GENERAL', description: '' });
    const [msg, setMsg] = useState(null);

    const fetchSRs = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/service-requests`, {
                method: 'GET', // We added a GET route for customer SRs? Let's assume yes or add it.
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            // handle error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSRs(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMsg({ type: 'info', text: 'Submitting request...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/service-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'Service Request captured. Ref ID: ' + data.requestId });
                setShowAdd(false);
                setForm({ type: 'GENERAL', description: '' });
                fetchSRs();
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to submit.' });
        }
    };

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Service Support Desk</h1>
                <button className={styles.btnPrimary} onClick={() => setShowAdd(!showAdd)}>
                    {showAdd ? 'Cancel' : 'New Service Request'}
                </button>
            </header>

            {msg && <div className={msg.type === 'error' ? styles.errorBanner : styles.successBanner} style={{ marginBottom: '24px' }}>{msg.text}</div>}

            {showAdd && (
                <div className={styles.tableContainer} style={{ padding: '24px', marginBottom: '2rem' }}>
                    <h2 className={styles.tableTitle}>Submit a Request</h2>
                    <form onSubmit={handleSubmit}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Request Type</label>
                            <select className={styles.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                <option value="GENERAL">General Query</option>
                                <option value="CHEQUE_BOOK">Cheque Book Correction</option>
                                <option value="ADDRESS_CHANGE">Address Change</option>
                                <option value="FD_RENEWAL">FD Auto-Renewal Change</option>
                                <option value="COMPLAINT">Lodge a Complaint</option>
                            </select>
                        </div>
                        <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
                            <label className={styles.label}>Detailed Description</label>
                            <textarea
                                className={styles.input}
                                style={{ height: '100px', paddingTop: '10px' }}
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Describe your request in detail..."
                                required
                            />
                        </div>
                        <button type="submit" className={styles.btnPrimary} style={{ width: '100%', marginTop: '16px' }}>Submit Ticket</button>
                    </form>
                </div>
            )}

            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Your Recent Requests</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>REF ID</th>
                            <th>TYPE</th>
                            <th>DESCRIPTION</th>
                            <th>DATE</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No active service requests.</td></tr>
                        ) : requests.map((sr, i) => (
                            <tr key={sr.REQUEST_ID || i}>
                                <td style={{ fontFamily: 'DM Mono' }}>{sr.REQUEST_ID}</td>
                                <td>{sr.REQUEST_TYPE}</td>
                                <td title={sr.DESCRIPTION}>{sr.DESCRIPTION?.substring(0, 40)}...</td>
                                <td>{new Date(sr.CREATED_AT).toLocaleDateString()}</td>
                                <td>
                                    <span className={sr.STATUS === 'RESOLVED' ? styles.statusDone : styles.statusPending}>
                                        {sr.STATUS}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
