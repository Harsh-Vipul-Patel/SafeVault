'use client';
import { useState, useEffect } from 'react';
import styles from '../../teller/teller.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerOpenDeposit() {
    const [form, setForm] = useState({
        customerId: '',
        linkedAccountId: '',
        type: 'FD',
        amount: '',
        tenure: '12',
        rateType: 'STANDARD'
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [customerInfo, setCustomerInfo] = useState(null);

    const handleLookup = async () => {
        if (!form.customerId) return;
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/lookup?query=${form.customerId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setCustomerInfo(data.results[0]);
                setForm(f => ({ ...f, linkedAccountId: data.results[0].ACCOUNT_ID }));
            } else {
                setMessage({ type: 'error', text: 'Customer not found.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Lookup failed.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const token = getToken();
            const endpoint = form.type === 'FD' ? '/api/teller/deposits/open-fd' : '/api/teller/deposits/open-rd';
            const payload = form.type === 'FD' ? {
                customerId: customerInfo.CUSTOMER_ID,
                linkedAccountId: form.linkedAccountId,
                amount: form.amount,
                tenureMonths: form.tenure,
                rateType: form.rateType
            } : {
                customerId: customerInfo.CUSTOMER_ID,
                linkedAccountId: form.linkedAccountId,
                instalmentAmount: form.amount,
                tenureMonths: form.tenure
            };

            const res = await fetch(`${API}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                setForm({ ...form, amount: '' });
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Request failed.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.dashboardContainer}>
            <header className={styles.sectionHeader}>
                <h1 className={styles.title}>Deposit Account Setup</h1>
                <p className={styles.subtitle}>Open new Fixed or Recurring Deposits for customers</p>
            </header>

            <div className={styles.card} style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ flex: 1 }}>
                        <label className={styles.label}>Customer ID / Account ID</label>
                        <input type="text" className={styles.input} value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} />
                    </div>
                    <button className={styles.btnPrimary} style={{ alignSelf: 'flex-end' }} onClick={handleLookup} disabled={loading}>Lookup</button>
                </div>

                {customerInfo && (
                    <form onSubmit={handleSubmit}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                            <p><strong>Customer:</strong> {customerInfo.FULL_NAME} ({customerInfo.CUSTOMER_ID})</p>
                            <p><strong>Linked Account:</strong> {form.linkedAccountId}</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Deposit Type</label>
                                <select className={styles.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    <option value="FD">Fixed Deposit (One-time)</option>
                                    <option value="RD">Recurring Deposit (Monthly)</option>
                                </select>
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>{form.type === 'FD' ? 'Principal Amount' : 'Monthly Instalment'}</label>
                                <input type="number" className={styles.input} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Tenure (Months)</label>
                                <select className={styles.input} value={form.tenure} onChange={e => setForm({ ...form, tenure: e.target.value })}>
                                    <option value="6">6 Months</option>
                                    <option value="12">12 Months (1 Year)</option>
                                    <option value="24">24 Months (2 Years)</option>
                                    <option value="36">36 Months (3 Years)</option>
                                    <option value="60">60 Months (5 Years)</option>
                                </select>
                            </div>

                            {form.type === 'FD' && (
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Rate Category</label>
                                    <select className={styles.input} value={form.rateType} onChange={e => setForm({ ...form, rateType: e.target.value })}>
                                        <option value="STANDARD">Standard Rate</option>
                                        <option value="SENIOR_CITIZEN">Senior Citizen (+0.5%)</option>
                                        <option value="STAFF">Staff Rate (+1.0%)</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <button type="submit" className={styles.btnPrimary} style={{ width: '100%', marginTop: '24px' }} disabled={loading}>
                            {loading ? 'Processing...' : `Confirm & Open ${form.type}`}
                        </button>
                    </form>
                )}
            </div>

            {message && <div className={message.type === 'success' ? styles.successBanner : styles.errorBanner} style={{ marginTop: '24px', textAlign: 'center' }}>{message.text}</div>}
        </div>
    );
}
