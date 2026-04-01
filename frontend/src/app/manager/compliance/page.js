'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ComplianceFlags() {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reviewLoading, setReviewLoading] = useState(null);
    const [reviewFlag, setReviewFlag] = useState(null);

    useEffect(() => {
        fetchFlags();
    }, []);

    const fetchFlags = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
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
            const token = localStorage.getItem('suraksha_token');
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
                                    <button className={styles.btnReject} onClick={() => setReviewFlag(f)}>Review Required</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {reviewFlag && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className={styles.panel} style={{ background: '#1E293B', padding: '32px', width: '450px', borderRadius: '12px', color: '#F8FAFC', borderTop: '4px solid #F59E0B' }}>
                        <h3 style={{ marginBottom: '16px', color: '#F8FAFC', borderBottom: 'none' }}>Compliance Alert — Velocity Breach Detected</h3>
                        <div style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '24px', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }}>
                                <span style={{ color: '#94A3B8' }}>Account:</span> <span style={{ fontFamily: 'monospace' }}>{reviewFlag.ACCOUNT_ID}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }}>
                                <span style={{ color: '#94A3B8' }}>Flag Type:</span> <span style={{ color: '#F59E0B', fontWeight: 'bold' }}>{reviewFlag.FLAG_TYPE}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }}>
                                <span style={{ color: '#94A3B8' }}>Today Total:</span> <span style={{ fontWeight: 600 }}>Rs.{Number((Number(reviewFlag.THRESHOLD_VALUE) || 500000) * 1.2).toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }}>
                                <span style={{ color: '#94A3B8' }}>Threshold:</span> <span>Rs.{Number(reviewFlag.THRESHOLD_VALUE || 500000).toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr' }}>
                                <span style={{ color: '#94A3B8' }}>Flagged At:</span> <span>{new Date(reviewFlag.FLAGGED_AT).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setReviewFlag(null)} 
                                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Review
                            </button>
                            <button 
                                onClick={() => { handleReview(reviewFlag.FLAG_ID); setReviewFlag(null); }} 
                                style={{ flex: 1, padding: '12px', background: '#3B82F6', border: 'none', color: '#FFF', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Mark Cleared
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
