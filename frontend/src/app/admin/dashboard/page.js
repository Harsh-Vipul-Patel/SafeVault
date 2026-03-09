'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function AdminDashboard() {
    const [monitor, setMonitor] = useState({ activeSessions: 0, activeJobs: 0, failedLogins: 0 });
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const headers = { Authorization: `Bearer ${getToken()}` };

                // Fetch Overview
                const res1 = await fetch(`${API}/api/admin/monitor`, { headers });
                if (!res1.ok) throw new Error('Failed to fetch monitor data');
                const data1 = await res1.json();
                setMonitor({
                    activeSessions: data1.activeSessions || 0,
                    activeJobs: data1.activeJobs || 0,
                    failedLogins: data1.failedLogins || 0
                });

                // Fetch Scheduler Jobs
                const res2 = await fetch(`${API}/api/admin/scheduler`, { headers });
                if (res2.ok) {
                    const data2 = await res2.json();
                    setJobs(data2.control || []);
                }

                setLoading(false);
            } catch (err) {
                console.error(err);
                setError('Could not connect to Oracle DB. Is the backend running?');
                setLoading(false);
            }
        };

        fetchDashboard();
        // Live polling every 10s
        const interval = setInterval(fetchDashboard, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div style={{ color: '#94A3B8', padding: '40px', textAlign: 'center' }}>Connecting to Oracle Data Dictionary…</div>
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    System Health Dashboard
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#10B981', fontFamily: 'DM Mono', letterSpacing: '0.05em', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
                        LIVE ORACLE CONNECTION
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={() => window.location.reload()}>↻ REFRESH</button>
                </div>
            </header>

            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>{error}</div>}

            <div className={styles.telemetryGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>ACTIVE SESSIONS <span className={styles.resValue}>{monitor.activeSessions}</span></div>
                    <div className={styles.resSub} style={{ marginTop: '12px' }}>Across all branches — <code>v$session</code></div>
                </div>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>BATCH JOBS <span className={styles.resValue} style={{ color: '#10B981' }}>{monitor.activeJobs > 0 ? monitor.activeJobs : '0/0'}</span></div>
                    <div className={styles.resSub} style={{ marginTop: '12px' }}><code>ACCRUAL_BATCH_CONTROL</code> running</div>
                </div>
                <div className={styles.resourceCard}>
                    <div className={styles.resTop}>FAILED LOGINS <span className={styles.resValue} style={{ color: monitor.failedLogins > 0 ? '#EF4444' : '#F8FAFC' }}>{monitor.failedLogins}</span></div>
                    <div className={styles.resSub} style={{ marginTop: '12px' }}>Security flags from `USERS` table</div>
                </div>
            </div>

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Recent Batch Executions</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr' }}>
                            <div>BATCH ID</div><div>RUN DATE</div><div>ACCOUNTS PROCESSED</div><div>DURATION</div><div>STATUS</div>
                        </div>
                        {jobs.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>No batch jobs found.</div>
                        ) : jobs.map(job => {
                            const d1 = job.START_TIME || job.start_time;
                            const d2 = job.END_TIME || job.end_time;
                            let duration = '—';
                            if (d1 && d2) {
                                const ms = new Date(d2) - new Date(d1);
                                duration = (ms / 1000).toFixed(1) + ' sec';
                            }

                            const s = (job.STATUS || job.status || '').toUpperCase();
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr' }} key={job.BATCH_ID || job.batch_id}>
                                    <div className={styles.monoBlue}>{job.BATCH_ID || job.batch_id}</div>
                                    <div>{new Date(job.BATCH_DATE || job.batch_date).toLocaleString('en-IN')}</div>
                                    <div style={{ fontFamily: 'DM Mono' }}>{job.PROCESSED_ACCOUNTS || job.processed_accounts} / {job.TOTAL_ACCOUNTS || job.total_accounts}</div>
                                    <div style={{ fontFamily: 'DM Mono', color: '#94A3B8' }}>{duration}</div>
                                    <div className={s === 'COMPLETED' ? styles.statusOk : s === 'FAILED' ? styles.statusCrit : styles.statusWarn}>
                                        {s}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
