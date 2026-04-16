'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function BranchReports() {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/reports?fromDate=${fromDate}&toDate=${toDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to generate report');
            const data = await res.json();
            setReportData(data);
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

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Full Branch Reports</div>
                    <div className={styles.headerSubtitle}>Generate data-driven reports from Oracle TRANSACTIONS, ACCOUNTS, and EMPLOYEES</div>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                {/* GENERATE REPORT */}
                <div className={styles.panel} style={{ padding: '32px' }}>
                    <h2 style={{ fontSize: '18px', color: 'var(--cream)', marginBottom: '24px' }}>Generate New Report</h2>
                    <div className={styles.formGroup}>
                        <label>Reporting Period</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <input type="date" className={styles.input} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                            <input type="date" className={styles.input} value={toDate} onChange={e => setToDate(e.target.value)} />
                        </div>
                    </div>
                    <button className={styles.btnPrimary} style={{ marginTop: '12px' }} onClick={fetchReport} disabled={loading}>
                        {loading ? 'COMPILING FROM ORACLE...' : 'COMPILE REPORT'}
                    </button>
                </div>

                {/* REPORT SUMMARY */}
                <div className={styles.panel} style={{ padding: '32px' }}>
                    <h2 style={{ fontSize: '18px', color: 'var(--cream)', marginBottom: '24px' }}>Report Summary</h2>
                    {!reportData ? (
                        <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Select a date range and click "Compile Report" to generate.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Period</span>
                                <span style={{ color: 'var(--gold2)', fontFamily: 'DM Mono', fontSize: '12px' }}>{formatDate(reportData.period?.from)} — {formatDate(reportData.period?.to)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Cash Flow Days</span>
                                <span style={{ color: 'var(--cream)', fontSize: '14px', fontWeight: 600 }}>{reportData.cashFlowSummary?.length || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Account Types Opened</span>
                                <span style={{ color: 'var(--cream)', fontSize: '14px', fontWeight: 600 }}>{reportData.accountAcquisition?.length || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Active Tellers</span>
                                <span style={{ color: 'var(--cream)', fontSize: '14px', fontWeight: 600 }}>{reportData.tellerPerformance?.length || 0}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* CASH FLOW TABLE */}
            {reportData?.cashFlowSummary?.length > 0 && (
                <div className={styles.panel}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--cream)' }}>Daily Cash Flow Summary</h3>
                    </div>
                    <div className={styles.tableWrap}>
                        <div className={styles.thRow} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                            <div>DATE</div>
                            <div>CREDITS</div>
                            <div>DEBITS</div>
                            <div>TXN COUNT</div>
                        </div>
                        {reportData.cashFlowSummary.map((row, i) => (
                            <div className={styles.tdRow} key={i} style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                                <div style={{ fontSize: '12px' }}>{formatDate(row.TXN_DATE)}</div>
                                <div style={{ color: '#3DD68C', fontWeight: 600 }}>₹ {Number(row.TOTAL_CREDITS).toLocaleString('en-IN')}</div>
                                <div style={{ color: '#FF4A4A', fontWeight: 600 }}>₹ {Number(row.TOTAL_DEBITS).toLocaleString('en-IN')}</div>
                                <div>{row.TXN_COUNT}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TELLER PERFORMANCE */}
            {reportData?.tellerPerformance?.length > 0 && (
                <div className={styles.panel}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--cream)' }}>Teller Performance Metrics</h3>
                    </div>
                    <div className={styles.tableWrap}>
                        <div className={styles.thRow} style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                            <div>TELLER ID</div>
                            <div>TXN COUNT</div>
                            <div>TOTAL AMOUNT</div>
                        </div>
                        {reportData.tellerPerformance.map((row, i) => (
                            <div className={styles.tdRow} key={i} style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                                <div className={styles.idMono}>{row.INITIATED_BY}</div>
                                <div>{row.TXN_COUNT}</div>
                                <div className={styles.tdAmount}>₹ {Number(row.TOTAL_AMOUNT).toLocaleString('en-IN')}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
