'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu,
    Activity,
    Shield,
    Terminal,
    RefreshCw,
    Clock,
    CheckCircle2,
    AlertCircle,
    Database,
    Lock,
    Command,
    Zap
} from 'lucide-react';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function AdminDashboard() {
    const [monitor, setMonitor] = useState({ activeSessions: 0, activeJobs: 0, failedLogins: 0 });
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDashboard = async () => {
        try {
            const headers = { Authorization: `Bearer ${getToken()}` };
            const res1 = await fetch(`${API}/api/admin/monitor`, { headers });
            if (!res1.ok) throw new Error('Failed to fetch monitor data');
            const data1 = await res1.json();
            setMonitor({
                activeSessions: data1.activeSessions || 0,
                activeJobs: data1.activeJobs || 0,
                failedLogins: data1.failedLogins || 0
            });

            const res2 = await fetch(`${API}/api/admin/scheduler`, { headers });
            if (res2.ok) {
                const data2 = await res2.json();
                setJobs(data2.control || []);
            }
            setError(null);
        } catch (err) {
            console.error(err);
            setError('System Link Interrupted: Oracle Connection Timeout');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
        const interval = setInterval(fetchDashboard, 10000);
        return () => clearInterval(interval);
    }, []);

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
    };

    if (loading) {
        return (
            <div className={styles.loadingWrapper}>
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    <Terminal size={40} color="var(--indigo)" />
                </motion.div>
                <p>Initializing Secure Shell to Oracle Core...</p>
            </div>
        );
    }

    return (
        <motion.div
            className={styles.dashboard}
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <motion.header variants={itemVariants} className={styles.header}>
                <div className={styles.titleGroup}>
                    <div className={styles.titleRow}>
                        <h1 className={`${styles.greeting} text-gradient-gold`}>System Resilience</h1>
                        <div className={styles.healthBadge}>
                            <motion.div
                                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className={styles.pulseDot}
                            />
                            CORE STATUS: NOMINAL
                        </div>
                    </div>
                    <p className={styles.headerSub}>Root Terminal: <code>/dev/suraksha/oracle-v8</code> · Uptime: 99.998%</p>
                </div>
                <div className={styles.headerActions}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={styles.btnRefresh}
                        onClick={fetchDashboard}
                    >
                        <RefreshCw size={14} /> ANALYZE
                    </motion.button>
                </div>
            </motion.header>

            {error && (
                <motion.div variants={itemVariants} className={styles.errorAlert}>
                    <AlertCircle size={18} /> {error}
                </motion.div>
            )}

            <div className={styles.telemetryGrid}>
                <motion.div variants={itemVariants} className={`${styles.resourceCard} pearl-card`}>
                    <div className={styles.resTop}>
                        <div className={styles.resLabel}><Activity size={14} /> LIVE SESSIONS</div>
                        <Lock size={14} className={styles.resIcon} />
                    </div>
                    <div className={styles.resMain}>
                        <span className={styles.resValue}>{monitor.activeSessions}</span>
                        <div className={styles.resTrend}>v$session</div>
                    </div>
                    <div className={styles.progressBack}><motion.div className={styles.progressFill} initial={{ width: 0 }} animate={{ width: '45%' }} /></div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.resourceCard} pearl-card`}>
                    <div className={styles.resTop}>
                        <div className={styles.resLabel}><Command size={14} /> BATCH QUEUE</div>
                        <Database size={14} className={styles.resIcon} />
                    </div>
                    <div className={styles.resMain}>
                        <span className={`${styles.resValue} ${styles.textGreen}`}>{monitor.activeJobs > 0 ? monitor.activeJobs : '0/0'}</span>
                        <div className={styles.resTrend}>Scheduler Active</div>
                    </div>
                    <div className={styles.progressBack}><motion.div className={`${styles.progressFill} ${styles.bgGreen}`} initial={{ width: 0 }} animate={{ width: '12%' }} /></div>
                </motion.div>

                <motion.div variants={itemVariants} className={`${styles.resourceCard} pearl-card`}>
                    <div className={styles.resTop}>
                        <div className={styles.resLabel}><Shield size={14} /> AUTH CHALLENGES</div>
                        <Zap size={14} className={styles.resIcon} />
                    </div>
                    <div className={styles.resMain}>
                        <span className={`${styles.resValue} ${monitor.failedLogins > 0 ? styles.textRed : ''}`}>{monitor.failedLogins}</span>
                        <div className={styles.resTrend}>Security Flags</div>
                    </div>
                    <div className={styles.progressBack}><motion.div className={`${styles.progressFill} ${styles.bgRed}`} initial={{ width: 0 }} animate={{ width: monitor.failedLogins > 0 ? '15%' : '2%' }} /></div>
                </motion.div>
            </div>

            <div className={styles.dataGrid}>
                <motion.div variants={itemVariants} className={`${styles.panel} glass-surface`}>
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitleGroup}>
                            <Terminal size={18} />
                            <h2 className={styles.panelTitle}>Kernel Batch Scheduler</h2>
                        </div>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th}>
                            <div>ID</div>
                            <div>EXECUTION DATE</div>
                            <div>PROCESSING</div>
                            <div>TIME</div>
                            <div style={{ textAlign: 'right' }}>STATUS</div>
                        </div>
                        <div className={styles.tableBody}>
                            {jobs.length === 0 ? (
                                <div className={styles.emptyState}>No batch processes in history logs.</div>
                            ) : (
                                <AnimatePresence>
                                    {jobs.map((job, i) => {
                                        const d1 = job.START_TIME || job.start_time;
                                        const d2 = job.END_TIME || job.end_time;
                                        let duration = '—';
                                        if (d1 && d2) {
                                            const ms = new Date(d2) - new Date(d1);
                                            duration = (ms / 1000).toFixed(1) + 's';
                                        }

                                        const s = (job.STATUS || job.status || '').toUpperCase();
                                        return (
                                            <motion.div
                                                className={styles.td}
                                                key={job.BATCH_ID || job.batch_id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                            >
                                                <div className={styles.monoBlue}>#{job.BATCH_ID || job.batch_id}</div>
                                                <div className={styles.dateCell}>
                                                    <Clock size={12} /> {new Date(job.BATCH_DATE || job.batch_date).toLocaleDateString()}
                                                </div>
                                                <div className={styles.mono}>
                                                    {job.PROCESSED_ACCOUNTS || job.processed_accounts} / {job.TOTAL_ACCOUNTS || job.total_accounts}
                                                </div>
                                                <div className={styles.monoMuted}>{duration}</div>
                                                <div className={styles.statusCell}>
                                                    <span className={s === 'COMPLETED' ? styles.statusOk : s === 'FAILED' ? styles.statusCrit : styles.statusWarn}>
                                                        {s === 'COMPLETED' && <CheckCircle2 size={12} />}
                                                        {s === 'FAILED' && <AlertCircle size={12} />}
                                                        {s}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
