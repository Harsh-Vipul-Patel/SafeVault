'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CustomerBeneficiaries() {
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: '', nickName: '', bankName: '', accountNo: '', ifsc: '' });
    const [actionMsg, setActionMsg] = useState(null);

    const fetchBenes = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/beneficiaries`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setBeneficiaries(data.beneficiaries || []);
        } catch (err) {
            setError('Could not load beneficiaries.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBenes(); }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        setActionMsg({ type: 'info', text: 'Adding beneficiary...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/beneficiaries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok) {
                setActionMsg({ type: 'success', text: 'Beneficiary added! It will be active after the cooling period (24h).' });
                setShowAdd(false);
                setForm({ name: '', nickName: '', bankName: '', accountNo: '', ifsc: '' });
                fetchBenes();
            } else {
                setActionMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Failed to add beneficiary.' });
        }
    };

    const handleActivate = async (id) => {
        setActionMsg({ type: 'info', text: 'Activating beneficiary...' });
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/beneficiaries/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ beneficiaryId: id })
            });
            const data = await res.json();
            if (res.ok) {
                setActionMsg({ type: 'success', text: data.message });
                fetchBenes();
            } else {
                setActionMsg({ type: 'error', text: data.message });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Failed to activate beneficiary.' });
        }
    };

    if (loading && beneficiaries.length === 0) return <div className={styles.loadingState}>Loading beneficiaries...</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Manage Beneficiaries</h1>
                <button className={styles.btnPrimary} onClick={() => setShowAdd(!showAdd)}>
                    {showAdd ? 'Cancel' : '+ Add New Beneficiary'}
                </button>
            </header>

            {actionMsg && (
                <div className={actionMsg.type === 'error' ? styles.errorBanner : styles.successBanner} style={{ marginBottom: '24px' }}>
                    {actionMsg.text}
                </div>
            )}

            {showAdd && (
                <div className={styles.tableContainer} style={{ padding: '24px', marginBottom: '2rem' }}>
                    <h2 className={styles.tableTitle}>Transfer Beneficiary Details</h2>
                    <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Full Name (as per Bank)</label>
                            <input type="text" className={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Nick Name</label>
                            <input type="text" className={styles.input} value={form.nickName} onChange={e => setForm({ ...form, nickName: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Bank Name</label>
                            <input type="text" className={styles.input} value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Account Number</label>
                            <input type="text" className={styles.input} value={form.accountNo} onChange={e => setForm({ ...form, accountNo: e.target.value })} required />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>IFSC Code</label>
                            <input type="text" className={styles.input} value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} placeholder="e.g. SBIN000123" required />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px', marginTop: '16px' }}>
                            <button type="submit" className={styles.btnPrimary} style={{ flex: 1 }}>Confirm & Add</button>
                            <button type="button" className={styles.btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Saved Beneficiaries</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>NICK NAME</th>
                            <th>BENEFICIARY NAME</th>
                            <th>BANK</th>
                            <th>ACCOUNT NO</th>
                            <th>IFSC</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {beneficiaries.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No beneficiaries added.</td></tr>
                        ) : beneficiaries.map((b, i) => (
                            <tr key={b.BENE_ID || i}>
                                <td style={{ fontWeight: '600' }}>{b.NICKNAME}</td>
                                <td>{b.BENEFICIARY_NAME}</td>
                                <td>{b.BANK_NAME}</td>
                                <td style={{ fontFamily: 'DM Mono' }}>{b.ACCOUNT_NUMBER}</td>
                                <td style={{ fontFamily: 'DM Mono' }}>{b.IFSC_CODE}</td>
                                <td>
                                    <span style={{ display: 'inline-block', marginBottom: b.ACTIVATION_STATUS === 'PENDING' ? '8px' : '0' }} className={b.ACTIVATION_STATUS === 'ACTIVE' ? styles.statusDone : styles.statusPending}>
                                        {b.ACTIVATION_STATUS}
                                    </span>
                                    {b.ACTIVATION_STATUS === 'PENDING' && (
                                        <button 
                                            onClick={() => handleActivate(b.BENEFICIARY_ID)}
                                            style={{ display: 'block', padding: '4px 8px', fontSize: '12px', background: 'rgba(52,211,153,0.2)', color: '#34D399', border: '1px solid #34D399', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            Activate
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.actionsRow} style={{ marginTop: '2rem' }}>
                <div className={styles.summaryCard} style={{ width: '100%', maxWidth: 'none', background: 'rgba(52,211,153,0.05)', border: '1px dashed #059669' }}>
                    <p style={{ color: '#34D399', fontSize: '14px' }}>
                        <strong>Security Tip:</strong> To protect your account, newly added beneficiaries are subject to a 24-hour cooling period before they become active for transfers.
                    </p>
                </div>
            </div>
        </div>
    );
}
