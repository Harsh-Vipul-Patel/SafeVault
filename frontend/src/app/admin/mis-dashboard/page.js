'use client';
import { useEffect, useMemo, useState } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Rs 0.00';
    return 'Rs ' + Number(value).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export default function AdminMISDashboard() {
    const [mis, setMis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchMIS = async () => {
        setLoading(true);
        setError('');
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/admin/mis/summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to fetch MIS summary');
            }
            setMis(data);
        } catch (e) {
            setError(e.message || 'Could not fetch MIS summary.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMIS();
    }, []);

    const netInterestIncome = useMemo(() => {
        const income = Number(mis?.interestIncome || 0);
        const expense = Number(mis?.projectedInterestExpense || 0);
        return income - expense;
    }, [mis]);

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>Bank-wide MIS & NII Monitor</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchMIS}>REFRESH</button>
                </div>
            </header>

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: '#FCA5A5',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontWeight: 600
                }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div className={styles.loading}>Building consolidated MIS snapshot...</div>
            ) : (
                <>
                    <div className={styles.telemetryGrid}>
                        <div className={`${styles.resourceCard} pearl-card`}>
                            <div className={styles.resTop}>LOAN INTEREST INCOME</div>
                            <div className={styles.resMain}>
                                <span className={styles.resValue}>{formatINR(mis?.interestIncome || 0)}</span>
                                <div className={styles.resTrend}>v_loan_interest_income</div>
                            </div>
                        </div>

                        <div className={`${styles.resourceCard} pearl-card`}>
                            <div className={styles.resTop}>DEPOSIT INTEREST EXPENSE (FD/RD + SAVINGS POSTED)</div>
                            <div className={styles.resMain}>
                                <span className={styles.resValue}>{formatINR(mis?.projectedInterestExpense || 0)}</span>
                                <div className={styles.resTrend}>v_fd_interest_expense (all-time savings postings included)</div>
                            </div>
                        </div>

                        <div className={`${styles.resourceCard} pearl-card`}>
                            <div className={styles.resTop}>NET INTEREST INCOME</div>
                            <div className={styles.resMain}>
                                <span className={styles.resValue}>{formatINR(netInterestIncome)}</span>
                                <div className={styles.resTrend}>Bank-wide consolidated NII</div>
                            </div>
                        </div>

                        <div className={`${styles.resourceCard} pearl-card`}>
                            <div className={styles.resTop}>FEE INCOME</div>
                            <div className={styles.resMain}>
                                <span className={styles.resValue}>{formatINR(mis?.feeIncome || 0)}</span>
                                <div className={styles.resTrend}>Fee and penalty income</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                        <div className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h2 className={styles.panelTitle}>Liquidity and Reserve Health by Branch</h2>
                            </div>
                            <div className={styles.table}>
                                <div className={styles.th} style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr' }}>
                                    <div>BRANCH</div>
                                    <div>TOTAL DEPOSITS</div>
                                    <div>TOTAL LOANS</div>
                                    <div>LDR (%)</div>
                                    <div>RESERVE STATUS</div>
                                </div>

                                {(mis?.liquidity || []).length === 0 && (
                                    <div className={styles.td} style={{ gridTemplateColumns: '1fr' }}>
                                        <div>No branch liquidity records found.</div>
                                    </div>
                                )}

                                {(mis?.liquidity || []).map((row, idx) => {
                                    const ldr = Number(row.LIQUIDITY_RATIO || 0);
                                    const status = row.RESERVE_STATUS || 'UNKNOWN';
                                    const statusColor = status === 'HEALTHY' ? '#10B981' : '#F59E0B';

                                    return (
                                        <div className={styles.td} style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr' }} key={`${row.BRANCH_ID || row.BRANCH_NAME || 'BR'}-${idx}`}>
                                            <div>{row.BRANCH_NAME || row.BRANCH_ID || 'UNKNOWN'}</div>
                                            <div>{formatINR(row.TOTAL_DEPOSITS || 0)}</div>
                                            <div>{formatINR(row.TOTAL_LOANS || 0)}</div>
                                            <div>{ldr.toFixed(2)}%</div>
                                            <div>
                                                <span style={{ color: statusColor, fontWeight: 700 }}>{status}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
