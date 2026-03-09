'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css'; // Reusing dashboard styles for consistency

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

export default function CustomerKYC() {
    const [kycRecords, setKycRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = getToken();
        fetch(`${API}/api/customer/kyc`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setKycRecords(data.kycRecords || []);
                setLoading(false);
            })
            .catch(err => {
                setError('Failed to fetch KYC records.');
                setLoading(false);
            });
    }, []);

    const latest = kycRecords[0];

    if (loading) return <div className={styles.loadingState}>Loading KYC history...</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>Know Your Customer (KYC)</h1>
                <Link href="/customer/dashboard" className={styles.viewAllLink}>← Back to Dashboard</Link>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* STATUS SUMMARY */}
            <div className={styles.cardsRow}>
                <div className={styles.summaryCard}>
                    <div className={styles.cardLabel}>CURRENT KYC STATUS</div>
                    <div className={styles.cardAmount}>
                        {latest ? latest.STATUS : 'NOT SUBMITTED'}
                    </div>
                    <div className={styles.cardDetail}>
                        Last Updated: {formatDate(latest?.UPDATED_AT || latest?.CREATED_AT)}
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardLabel}>DOCUMENT TYPE</div>
                    <div className={styles.cardAmount}>
                        {latest ? latest.DOCUMENT_TYPE : '—'}
                    </div>
                    <div className={styles.cardDetail}>
                        Ref: {latest ? latest.DOCUMENT_NUMBER : '—'}
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardLabel}>EXPIRY DATE</div>
                    <div className={styles.cardAmount}>
                        {latest ? formatDate(latest.EXPIRY_DATE).split(',')[0] : '—'}
                    </div>
                    <div className={styles.cardDetail}>
                        {latest?.STATUS === 'EXPIRED' ? '⚠️ Please renew immediately' : 'Status: ' + (latest?.STATUS || 'None')}
                    </div>
                </div>
            </div>

            {/* RECORDS TABLE */}
            <div className={styles.tableContainer}>
                <h2 className={styles.tableTitle}>Verification History</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>SUBMITTED DATE</th>
                            <th>DOCUMENT TYPE</th>
                            <th>DOCUMENT NUMBER</th>
                            <th>EXPIRY</th>
                            <th>VERIFIED BY</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {kycRecords.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No KYC records found.</td></tr>
                        ) : (
                            kycRecords.map((r, i) => (
                                <tr key={r.RECORD_ID || i}>
                                    <td>{formatDate(r.CREATED_AT)}</td>
                                    <td>{r.DOCUMENT_TYPE}</td>
                                    <td>{r.DOCUMENT_NUMBER}</td>
                                    <td>{formatDate(r.EXPIRY_DATE).split(',')[0]}</td>
                                    <td>{r.VERIFIED_BY || 'SYSTEM'}</td>
                                    <td>
                                        <span className={
                                            r.STATUS === 'VERIFIED' ? styles.statusDone :
                                                r.STATUS === 'EXPIRED' ? styles.statusFailed : styles.statusPending
                                        }>
                                            {r.STATUS}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className={styles.actionsRow} style={{ marginTop: '2rem' }}>
                <div className={styles.summaryCard} style={{ width: '100%', maxWidth: 'none', background: 'rgba(255,255,255,0.05)', border: '1px dashed #475569' }}>
                    <p style={{ color: '#94A3B8', fontSize: '14px' }}>
                        <strong>Note:</strong> To update your KYC documents, please visit your home branch with the original documents.
                        Our staff will verify and update your records in the system.
                    </p>
                </div>
            </div>
        </div>
    );
}
