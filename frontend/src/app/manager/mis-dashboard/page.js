'use client';
import { useState, useEffect } from 'react';
import styles from '../../manager/manager.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ManagerMIS() {
    const [mis, setMis] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = getToken();
        fetch(`${API}/api/manager/mis/summary`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setMis(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className={styles.loadingState}>Crunching MIS data...</div>;

    const netInterest = (mis?.interestIncome || 0) - (mis?.projectedInterestExpense || 0);

    return (
        <div className={styles.contentWrap}>
            <header className={styles.topbar} style={{ position: 'static', margin: '-20px -20px 20px -20px' }}>
                <div className={styles.breadcrumb}>Manager Console / <span className={styles.crumbActive}>Management Information System (MIS)</span></div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                {/* INTEREST DASHBOARD */}
                <div className={styles.card} style={{ padding: '24px', borderLeft: '4px solid #34D399' }}>
                    <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '8px' }}>INTEREST INCOME (LOANS)</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#F8FAFC' }}>{formatINR(mis?.interestIncome)}</div>
                    <div style={{ color: '#34D399', fontSize: '12px', marginTop: '4px' }}>↑ Accrued YTD</div>
                </div>

                <div className={styles.card} style={{ padding: '24px', borderLeft: '4px solid #F87171' }}>
                    <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '8px' }}>INTEREST EXPENSE (FD/RD + SAVINGS POSTED)</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#F8FAFC' }}>{formatINR(mis?.projectedInterestExpense)}</div>
                    <div style={{ color: '#F87171', fontSize: '12px', marginTop: '4px' }}>→ Projected + Posted Liability</div>
                </div>

                <div className={styles.card} style={{ padding: '24px', borderLeft: '4px solid #60A5FA' }}>
                    <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '8px' }}>NET INTEREST MARGIN</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: netInterest > 0 ? '#60A5FA' : '#F87171' }}>
                        {formatINR(netInterest)}
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '4px' }}>Branch Profitability View</div>
                </div>
            </div>

            {/* LIQUIDITY DATA */}
            <div className={styles.card} style={{ padding: '24px' }}>
                <h3 style={{ color: '#F8FAFC', marginBottom: '20px' }}>Branch Liquidity & Reserves</h3>
                <div className={styles.tableWrap}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E2E8F0' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                                <th style={{ padding: '12px' }}>BRANCH NAME</th>
                                <th style={{ padding: '12px' }}>TOTAL DEPOSITS</th>
                                <th style={{ padding: '12px' }}>TOTAL LOANS</th>
                                <th style={{ padding: '12px' }}>LDR (RATIO)</th>
                                <th style={{ padding: '12px' }}>RESERVE STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mis?.liquidity?.map((br, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #1E293B' }}>
                                    <td style={{ padding: '12px', fontWeight: '600' }}>{br.BRANCH_NAME || 'Main Branch'}</td>
                                    <td style={{ padding: '12px' }}>{formatINR(br.TOTAL_DEPOSITS)}</td>
                                    <td style={{ padding: '12px' }}>{formatINR(br.TOTAL_LOANS)}</td>
                                    <td style={{ padding: '12px', color: Number(br.LIQUIDITY_RATIO) > 80 ? '#F87171' : '#34D399' }}>
                                        {br.LIQUIDITY_RATIO}%
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            background: br.RESERVE_STATUS === 'HEALTHY' ? '#065F46' : '#991B1B'
                                        }}>
                                            {br.RESERVE_STATUS}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ marginTop: '32px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
                All figures represent live data from the Oracle 21c Database · Sync Time: {new Date().toLocaleTimeString()}
            </div>
        </div>
    );
}
