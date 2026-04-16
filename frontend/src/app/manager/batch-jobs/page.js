'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function BatchJobStatus() {
    const [batchJobs, setBatchJobs] = useState([]);
    const [summary, setSummary] = useState({ COMPLETED: 0, FAILED: 0, IN_PROGRESS: 0, PENDING: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchBatchJobs();
    }, []);

    const fetchBatchJobs = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/batch-jobs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch batch jobs');
            const data = await res.json();
            setBatchJobs(data.batchJobs || []);
            setSummary(data.summary || {});
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };

    const statusColor = (status) => {
        switch (status) {
            case 'COMPLETED': return '#3DD68C';
            case 'FAILED': return '#FF4A4A';
            case 'IN_PROGRESS': return '#5B9BFF';
            case 'PENDING': return '#E8B84B';
            default: return 'var(--muted)';
        }
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Batch Job Status</div>
                    <div className={styles.headerSubtitle}>Interest accrual and EOD processing — from Oracle ACCRUAL_BATCH_CONTROL</div>
                </div>
                <button className={styles.btnPrimary} onClick={fetchBatchJobs} disabled={loading}>
                    {loading ? 'REFRESHING...' : '↻ REFRESH'}
                </button>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            {/* SUMMARY CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                {[
                    { label: 'COMPLETED', value: summary.COMPLETED, color: '#3DD68C', icon: '✅' },
                    { label: 'IN PROGRESS', value: summary.IN_PROGRESS, color: '#5B9BFF', icon: '⏳' },
                    { label: 'PENDING', value: summary.PENDING, color: '#E8B84B', icon: '📋' },
                    { label: 'FAILED', value: summary.FAILED, color: '#FF4A4A', icon: '❌' }
                ].map((card) => (
                    <div key={card.label} style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '12px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--muted)' }}>{card.label}</span>
                            <span>{card.icon}</span>
                        </div>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '28px', fontWeight: 700, color: card.color }}>{card.value || 0}</div>
                    </div>
                ))}
            </div>

            {/* BATCH JOBS TABLE */}
            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '0.6fr 0.6fr 1fr 0.8fr 0.8fr 1fr 1fr' }}>
                        <div>RUN ID</div>
                        <div>BUCKET</div>
                        <div>ACCRUAL DATE</div>
                        <div>STATUS</div>
                        <div>PROCESSED</div>
                        <div>STARTED</div>
                        <div>COMPLETED</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading batch jobs from Oracle...</div>
                    ) : batchJobs.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No batch job records found in ACCRUAL_BATCH_CONTROL.</div>
                    ) : batchJobs.map((job) => (
                        <div className={styles.tdRow} key={job.RUN_ID} style={{ gridTemplateColumns: '0.6fr 0.6fr 1fr 0.8fr 0.8fr 1fr 1fr' }}>
                            <div className={styles.idMono}>#{job.RUN_ID}</div>
                            <div style={{ fontSize: '12px' }}>Bucket {job.BUCKET_ID}</div>
                            <div style={{ fontSize: '12px' }}>{formatDate(job.ACCRUAL_DATE)}</div>
                            <div><span style={{ color: statusColor(job.STATUS), fontWeight: 600, fontSize: '12px' }}>{job.STATUS}</span></div>
                            <div style={{ fontSize: '12px' }}>{job.ACCOUNTS_PROCESSED} accts</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatTime(job.STARTED_AT)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatTime(job.COMPLETED_AT)}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
