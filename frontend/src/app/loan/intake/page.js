'use client';
import { useState } from 'react';
import styles from '../loan-pages.module.css';

export default function ApplicationIntake() {
    const [formData, setFormData] = useState({
        customerId: '',
        linkedAccountId: '',
        loanType: 'PERSONAL',
        requestedAmount: '',
        tenureMonths: '',
        annualRate: ''
    });
    const [status, setStatus] = useState({ loading: false, error: '', success: '' });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ loading: true, error: '', success: '' });

        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch('http://localhost:5000/api/loan-manager/application/intake', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Intake failed');

            setStatus({ loading: false, error: '', success: `Success! Application ID: ${data.loanAppId}` });
            setFormData({ customerId: '', linkedAccountId: '', loanType: 'PERSONAL', requestedAmount: '', tenureMonths: '', annualRate: '' });
        } catch (err) {
            setStatus({ loading: false, error: err.message, success: '' });
        }
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Application Intake</h1>
                    <p className={styles.pageSubtitle}>Log a new loan request into the system</p>
                </div>
            </div>

            <div className={styles.section} style={{ maxWidth: '800px' }}>
                <form onSubmit={handleSubmit} className={styles.formGrid}>
                    <div className={styles.inputGroup}>
                        <label>Customer ID</label>
                        <input
                            type="text"
                            name="customerId"
                            value={formData.customerId}
                            onChange={handleChange}
                            placeholder="e.g. CUST-MUM-001"
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Linked Savings Account ID (For Debit/Credit)</label>
                        <input
                            type="text"
                            name="linkedAccountId"
                            value={formData.linkedAccountId}
                            onChange={handleChange}
                            placeholder="e.g. ACC-MUM-003-XXXX"
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Loan Type</label>
                        <select name="loanType" value={formData.loanType} onChange={handleChange} required>
                            <option value="PERSONAL">Personal Loan</option>
                            <option value="HOME">Home Loan</option>
                            <option value="VEHICLE">Vehicle Loan</option>
                            <option value="EDUCATION">Education Loan</option>
                        </select>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Requested Amount (₹)</label>
                        <input
                            type="number"
                            name="requestedAmount"
                            min="1000"
                            value={formData.requestedAmount}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Tenure (Months)</label>
                        <input
                            type="number"
                            name="tenureMonths"
                            min="6"
                            max="360"
                            value={formData.tenureMonths}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Annual Interest Rate (%)</label>
                        <input
                            type="number"
                            name="annualRate"
                            step="0.01"
                            min="1.00"
                            max="30.00"
                            value={formData.annualRate}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className={`${styles.inputGroup} ${styles.fullWidth}`} style={{ marginTop: '16px' }}>
                        <button type="submit" className={styles.submitBtn} disabled={status.loading}>
                            {status.loading ? 'Processing...' : 'Submit Application'}
                        </button>
                    </div>
                </form>

                {status.error && (
                    <div style={{ marginTop: '20px', padding: '16px', borderRadius: '8px', background: 'rgba(244,67,54,0.1)', color: '#F44336' }}>
                        {status.error}
                    </div>
                )}
                {status.success && (
                    <div style={{ marginTop: '20px', padding: '16px', borderRadius: '8px', background: 'rgba(76,175,80,0.1)', color: '#4CAF50' }}>
                        {status.success}
                    </div>
                )}
            </div>
        </div>
    );
}
