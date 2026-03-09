'use client';
import { useState } from 'react';
import styles from '../loan-pages.module.css';

export default function EMI_Repayments() {
    const [accountId, setAccountId] = useState('');
    const [emis, setEmis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [payStatus, setPayStatus] = useState({ id: null, loading: false, message: '' });

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!accountId.trim()) return;

        setLoading(true);
        setFetchError('');
        setEmis([]);

        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`http://localhost:5000/api/loan-manager/account/${accountId.trim()}/emis`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.message);

            if (data.emis && data.emis.length > 0) {
                setEmis(data.emis);
            } else {
                setFetchError('No EMI schedule found for this account.');
            }
        } catch (err) {
            setFetchError(err.message || 'Failed to fetch schedule');
        } finally {
            setLoading(false);
        }
    };

    const handlePayEmi = async (emiId) => {
        if (!confirm('Proceed to deduct this EMI from the linked account?')) return;

        setPayStatus({ id: emiId, loading: true, message: '' });

        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`http://localhost:5000/api/loan-manager/emi/pay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ emiId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            setPayStatus({ id: emiId, loading: false, message: 'Repayment Successful' });

            // Re-fetch to update status
            handleSearch({ preventDefault: () => { } });

            setTimeout(() => setPayStatus({ id: null }), 3000);
        } catch (err) {
            setPayStatus({ id: emiId, loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setPayStatus({ id: null }), 5000);
        }
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>EMI Repayments</h1>
                    <p className={styles.pageSubtitle}>Lookup loan accounts and process instalment payments</p>
                </div>
            </div>

            <div className={styles.section}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '32px', maxWidth: '500px' }}>
                    <div className={styles.inputGroup} style={{ flex: 1, marginBottom: 0 }}>
                        <label>Loan Account ID</label>
                        <input
                            type="text"
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            placeholder="e.g. LN-8293"
                            required
                        />
                    </div>
                    <button type="submit" className={styles.submitBtn} disabled={loading} style={{ padding: '14px 24px' }}>
                        {loading ? 'Searching...' : 'Lookup Schedule'}
                    </button>
                </form>

                {fetchError && <div style={{ color: '#F44336', marginBottom: '24px' }}>{fetchError}</div>}

                {emis.length > 0 && (
                    <div className={styles.tableContainer}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>Instalment No.</th>
                                    <th>Due Date</th>
                                    <th>Principal</th>
                                    <th>Interest</th>
                                    <th>Total EMI</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emis.map((emi) => {
                                    const isDue = emi.STATUS === 'PENDING' || emi.STATUS === 'OVERDUE';
                                    const isPaid = emi.STATUS === 'PAID';

                                    return (
                                        <tr key={emi.EMI_ID}>
                                            <td style={{ textAlign: 'center' }}>{emi.EMI_NUMBER}</td>
                                            <td>{new Date(emi.DUE_DATE).toLocaleDateString('en-GB')}</td>
                                            <td>₹{emi.PRINCIPAL_COMPONENT?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td>₹{emi.INTEREST_COMPONENT?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td style={{ fontWeight: 600, color: 'var(--gold2)' }}>
                                                ₹{emi.EMI_AMOUNT?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${styles['status_' + emi.STATUS]}`}>
                                                    {emi.STATUS}
                                                </span>
                                            </td>
                                            <td>
                                                {isDue && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handlePayEmi(emi.EMI_ID)}
                                                            className={styles.submitBtn}
                                                            style={{ padding: '6px 16px', fontSize: '11px', minWidth: '80px' }}
                                                            disabled={payStatus.id === emi.EMI_ID && payStatus.loading}
                                                        >
                                                            {payStatus.id === emi.EMI_ID && payStatus.loading ? 'Processing...' : 'Record Payment'}
                                                        </button>
                                                    </div>
                                                )}
                                                {payStatus.id === emi.EMI_ID && (
                                                    <div style={{ fontSize: '11px', color: payStatus.message.includes('Error') ? '#F44336' : '#4CAF50', marginTop: '4px' }}>
                                                        {payStatus.message}
                                                    </div>
                                                )}
                                                {isPaid && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cleared</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
