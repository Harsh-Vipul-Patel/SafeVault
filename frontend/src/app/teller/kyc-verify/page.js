'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from '../../teller/teller.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerKYCVerify() {
    const [customerId, setCustomerId] = useState('');
    const [docType, setDocType] = useState('AADHAAR');
    const [docNumber, setDocNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [customerInfo, setCustomerInfo] = useState(null);

    const handleLookup = async () => {
        if (!customerId) return;
        setLoading(true);
        setMessage(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/lookup?query=${customerId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setCustomerInfo(data.results[0]);
            } else {
                setMessage({ type: 'error', text: 'Customer not found.' });
                setCustomerInfo(null);
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Lookup failed.' });
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!customerInfo) return;
        setLoading(true);
        setMessage(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/kyc/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    customerId: customerInfo.CUSTOMER_ID,
                    docType,
                    docNumber,
                    expiryDate
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                // Reset form
                setDocNumber('');
                setExpiryDate('');
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Verification failed.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.dashboardContainer}>
            <header className={styles.sectionHeader}>
                <h1 className={styles.title}>KYC Verification Terminal</h1>
                <p className={styles.subtitle}>Verify and update customer identity documents</p>
            </header>

            <div className={styles.formGrid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* LOOKUP SECTION */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>1. Customer Identification</h2>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Account ID or Name</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                className={styles.input}
                                value={customerId}
                                onChange={(e) => setCustomerId(e.target.value)}
                                placeholder="e.g. ACC-MUM-003-..."
                            />
                            <button
                                className={styles.btnPrimary}
                                onClick={handleLookup}
                                disabled={loading}
                            >
                                {loading ? '...' : 'Lookup'}
                            </button>
                        </div>
                    </div>

                    {customerInfo && (
                        <div className={styles.resultBox} style={{ marginTop: '16px', padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }}>
                            <h3 style={{ color: '#34D399', marginBottom: '8px' }}>Customer Found</h3>
                            <p><strong>Name:</strong> {customerInfo.FULL_NAME}</p>
                            <p><strong>Cust ID:</strong> {customerInfo.CUSTOMER_ID}</p>
                            <p><strong>Current KYC:</strong>
                                <span style={{
                                    marginLeft: '8px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    background: customerInfo.KYC_STATUS === 'VERIFIED' ? '#065F46' : '#991B1B'
                                }}>
                                    {customerInfo.KYC_STATUS}
                                </span>
                            </p>
                        </div>
                    )}
                </section>

                {/* VERIFICATION FORM */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>2. Document Details</h2>
                    <form onSubmit={handleVerify}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Document Type</label>
                            <select
                                className={styles.input}
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                required
                            >
                                <option value="AADHAAR">Aadhaar Card</option>
                                <option value="PAN">PAN Card</option>
                                <option value="PASSPORT">Passport</option>
                                <option value="VOTER_ID">Voter ID</option>
                                <option value="DRIVING_LICENSE">Driving License</option>
                            </select>
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Document Number</label>
                            <input
                                type="text"
                                className={styles.input}
                                value={docNumber}
                                onChange={(e) => setDocNumber(e.target.value)}
                                placeholder="Enter ID number"
                                required
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Expiry Date</label>
                            <input
                                type="date"
                                className={styles.input}
                                value={expiryDate}
                                onChange={(e) => setExpiryDate(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.btnPrimary}
                            style={{ width: '100%', marginTop: '16px' }}
                            disabled={loading || !customerInfo}
                        >
                            {loading ? 'Processing...' : 'Verify & Update KYC'}
                        </button>
                    </form>
                </section>
            </div>

            {message && (
                <div className={message.type === 'success' ? styles.successBanner : styles.errorBanner} style={{ marginTop: '24px' }}>
                    {message.text}
                </div>
            )}
        </div>
    );
}
