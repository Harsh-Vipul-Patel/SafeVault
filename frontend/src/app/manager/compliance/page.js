'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ComplianceFlags() {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reviewLoading, setReviewLoading] = useState(null);

    useEffect(() => {
        fetchFlags();
    }, []);

    const fetchFlags = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/compliance`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch compliance flags');
            const data = await res.json();
            setFlags(data.flags || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (flagId) => {
        setReviewLoading(flagId);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/manager/compliance/${flagId}/review`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Review failed');
            await fetchFlags();
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setReviewLoading(null);
        }
    };

    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + ' mins ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' hours ago';
        return Math.floor(hrs / 24) + ' days ago';
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Compliance & System Flags</div>
                    <div className={styles.headerSubtitle}>Monitor automated velocity anomalies and KYC expirations — from Oracle COMPLIANCE_FLAGS</div>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '0.7fr 1.5fr 1fr 1fr 1fr 1fr' }}>
                        <div>FLAG ID</div>
                        <div>FLAG REASON</div>
                        <div>ACCOUNT</div>
                        <div>CUSTOMER</div>
                        <div>TRIGGER TIME</div>
                        <div style={{ textAlign: 'right' }}>STATUS</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading compliance flags from Oracle...</div>
                    ) : flags.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No compliance flags found.</div>
                    ) : flags.map((f) => (
                        <div className={styles.tdRow} key={f.FLAG_ID} style={{ gridTemplateColumns: '0.7fr 1.5fr 1fr 1fr 1fr 1fr' }}>
                            <div className={styles.idMono}>FLG-{f.FLAG_ID}</div>
                            <div style={{ color: f.FLAG_TYPE?.includes('Velocity') || f.FLAG_TYPE?.includes('VELOCITY') ? '#FF4A4A' : '#E8B84B', fontWeight: 600, fontSize: '13px' }}>{f.FLAG_TYPE} (₹{Number(f.THRESHOLD_VALUE).toLocaleString('en-IN')})</div>
                            <div className={styles.idMono}>{f.ACCOUNT_ID || '--'}</div>
                            <div style={{ fontSize: '12px' }}>{f.CUSTOMER_NAME || '--'}</div>
                            <div style={{ fontSize: '12px' }}>{timeAgo(f.FLAGGED_AT)}</div>
                            <div style={{ textAlign: 'right' }}>
                                {f.REVIEWED_BY ? (
                                    <span style={{ fontSize: '12px', color: '#3DD68C', fontWeight: 600 }}>Reviewed by {f.REVIEWED_BY}</span>
                                ) : reviewLoading === f.FLAG_ID ? (
                                    <span style={{ fontSize: '12px', color: 'var(--gold2)' }}>Reviewing...</span>
                                ) : (
                                    <button className={styles.btnReject} onClick={() => handleReview(f.FLAG_ID)}>Review Required</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
