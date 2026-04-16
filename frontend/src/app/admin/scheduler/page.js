'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function SchedulerMonitor() {
    const [jobs, setJobs] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);

    const fetchScheduler = async () => {
        try {
            const res = await fetch(`${API}/api/admin/scheduler`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setJobs(data.control || []);
            setLogs(data.logs || []);
            setLoading(false);
        } catch {
            setMsg('Failed to fetch scheduler data from Oracle.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchScheduler();
    }, []);

    if (loading) return <div className={styles.loading}>Pulling DBMS_SCHEDULER tasks from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Scheduler & Batch Monitor</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchScheduler}>↻ REFRESH</button>
                    <button className={styles.btnDanger} style={{ background: '#10B981', borderColor: '#10B981' }}>▶ TRIGGER BATCH</button>
                    <button className={styles.btnDanger}>■ STOP SCHEDULER</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Batch Control (<code>ACCRUAL_BATCH_CONTROL</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 2.5fr' }}>
                            <div>BATCH ID</div><div>RUN DATE</div><div>ACCOUNTS</div><div>DURATION</div><div>STATUS</div><div>ERROR</div>
                        </div>
                        {jobs.map(job => {
                            const d1 = job.START_TIME || job.start_time;
                            const d2 = job.END_TIME || job.end_time;
                            let duration = '—';
                            if (d1 && d2) duration = ((new Date(d2) - new Date(d1)) / 1000).toFixed(1) + ' sec';
                            const status = (job.STATUS || job.status || '').toUpperCase();
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 2.5fr' }} key={job.BATCH_ID || job.batch_id}>
                                    <div className={styles.monoBlue}>{job.BATCH_ID || job.batch_id}</div>
                                    <div>{d1 ? new Date(d1).toLocaleString('en-IN') : '—'}</div>
                                    <div style={{ fontFamily: 'DM Mono' }}>{job.PROCESSED_ACCOUNTS || job.processed_accounts} / {job.TOTAL_ACCOUNTS || job.total_accounts}</div>
                                    <div style={{ fontFamily: 'DM Mono', color: '#94A3B8' }}>{duration}</div>
                                    <div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                                            background: status === 'COMPLETED' ? 'rgba(16,185,129,0.1)' : status === 'FAILED' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                            color: status === 'COMPLETED' ? '#10B981' : status === 'FAILED' ? '#EF4444' : '#F59E0B'
                                        }}>
                                            {status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#EF4444' }}>{job.ERROR_MESSAGE || job.error_message || '—'}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Account Accrual Logs (<code>INTEREST_ACCRUAL_LOG</code>)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }}>
                            <div>ACCOUNT ID</div><div>PRINCIPAL</div><div>INTEREST ACCRUED</div><div>ACCRUAL DATE</div>
                        </div>
                        {logs.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No interest accrual logs found.</div>
                        ) : logs.map(l => (
                            <div className={styles.td} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }} key={l.LOG_ID || l.log_id}>
                                <div className={styles.monoBlue}>{l.ACCOUNT_ID || l.account_id}</div>
                                <div style={{ fontFamily: 'DM Mono' }}>₹{Number(l.PRINCIPAL_AMOUNT || l.principal_amount || 0).toFixed(2)}</div>
                                <div style={{ fontFamily: 'DM Mono', color: '#10B981', fontWeight: 600 }}>+₹{Number(l.INTEREST_AMOUNT || l.interest_amount || 0).toFixed(2)}</div>
                                <div style={{ fontSize: '12px', color: '#94A3B8' }}>{l.RUN_DATE || l.run_date ? new Date(l.RUN_DATE || l.run_date).toLocaleDateString('en-IN') : '—'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
