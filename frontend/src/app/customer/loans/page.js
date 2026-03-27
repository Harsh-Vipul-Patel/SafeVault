'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_COLORS = {
    RECEIVED: { bg: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8', border: 'rgba(56, 189, 248, 0.25)' },
    UNDER_REVIEW: { bg: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24', border: 'rgba(251, 191, 36, 0.25)' },
    APPROVED: { bg: 'rgba(52, 211, 153, 0.1)', color: '#34D399', border: 'rgba(52, 211, 153, 0.25)' },
    DISBURSED: { bg: 'rgba(96, 165, 250, 0.1)', color: '#60A5FA', border: 'rgba(96, 165, 250, 0.25)' },
    ACTIVE: { bg: 'rgba(16, 185, 129, 0.08)', color: '#10B981', border: 'rgba(16, 185, 129, 0.15)' },
    CLOSED: { bg: 'rgba(148, 163, 184, 0.1)', color: '#94A3B8', border: 'rgba(148, 163, 184, 0.25)' },
    DEFAULTED: { bg: 'rgba(248, 113, 113, 0.1)', color: '#F87171', border: 'rgba(248, 113, 113, 0.25)' },
    REJECTED: { bg: 'rgba(248, 113, 113, 0.1)', color: '#F87171', border: 'rgba(248, 113, 113, 0.25)' },
    PENDING: { bg: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24', border: 'rgba(251, 191, 36, 0.25)' },
    PAID: { bg: 'rgba(16, 185, 129, 0.08)', color: '#10B981', border: 'rgba(16, 185, 129, 0.15)' },
    OVERDUE: { bg: 'rgba(248, 113, 113, 0.1)', color: '#F87171', border: 'rgba(248, 113, 113, 0.25)' },
};

function StatusBadge({ status }) {
    const s = STATUS_COLORS[status] || STATUS_COLORS.RECEIVED;
    return (
        <span style={{
            fontSize: '11px', fontWeight: 700, padding: '5px 12px',
            borderRadius: '20px', background: s.bg, color: s.color,
            border: `1px solid ${s.border}`
        }}>
            {status}
        </span>
    );
}

export default function CustomerLoans() {
    const [loans, setLoans] = useState([]);
    const [emis, setEmis] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedLoan, setExpandedLoan] = useState(null);
    const [showApply, setShowApply] = useState(false);
    const [applying, setApplying] = useState(false);
    const [msg, setMsg] = useState(null);
    const [form, setForm] = useState({
        loanType: 'PERSONAL',
        requestedAmount: '',
        tenureMonths: '',
        annualRate: ''
    });

    const fetchLoans = () => {
        const token = getToken();
        if (!token) { setLoading(false); return; }
        setLoading(true);
        fetch(`${API}/api/customer/loans`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setLoans(data.loanApplications || []);
                setEmis(data.emiSchedules || []);
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to fetch loan details.');
                setLoading(false);
            });
    };

    useEffect(() => { fetchLoans(); }, []);

    const handleApply = async (e) => {
        e.preventDefault();
        setApplying(true);
        setMsg(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/customer/loan-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: data.message });
                setShowApply(false);
                setForm({ loanType: 'PERSONAL', requestedAmount: '', tenureMonths: '', annualRate: '' });
                fetchLoans();
            } else {
                setMsg({ type: 'error', text: data.message });
            }
        } catch {
            setMsg({ type: 'error', text: 'Failed to submit loan request.' });
        } finally {
            setApplying(false);
        }
    };

    const getEmisForLoan = (loanAccountId) => {
        return emis.filter(e => e.LOAN_ACCOUNT_ID === loanAccountId);
    };

    const getNextDueEmi = (loanAccountId) => {
        const loanEmis = getEmisForLoan(loanAccountId);
        return loanEmis.find(e => e.STATUS === 'PENDING' || e.STATUS === 'OVERDUE');
    };

    // Summary KPIs
    const activeLoans = loans.filter(l => ['ACTIVE', 'DISBURSED'].includes(l.APP_STATUS));
    const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.OUTSTANDING_PRINCIPAL || 0), 0);
    const pendingLoans = loans.filter(l => ['RECEIVED', 'UNDER_REVIEW', 'APPROVED'].includes(l.APP_STATUS));
    const overdueEmis = emis.filter(e => e.STATUS === 'OVERDUE');

    if (loading) {
        return <div className={styles.loadingState}>Loading your loan details…</div>;
    }

    return (
        <div className={styles.dashboard}>
            <header className={styles.tableHeader}>
                <h1 className={styles.greeting}>My Loans</h1>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Link href="/customer/dashboard" className={styles.viewAllLink}>← Back to Dashboard</Link>
                    <button
                        className={styles.btnPrimary}
                        onClick={() => setShowApply(!showApply)}
                        style={{ padding: '12px 24px', fontSize: '13px' }}
                    >
                        {showApply ? 'Cancel' : '+ Apply for Loan'}
                    </button>
                </div>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {msg && (
                <div style={{
                    background: msg.type === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(16,185,129,0.08)',
                    border: `1px solid ${msg.type === 'error' ? 'rgba(248,113,113,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    color: msg.type === 'error' ? '#F87171' : '#10B981',
                    padding: '16px 24px', borderRadius: '14px', fontSize: '14px', fontWeight: 600, marginBottom: '8px'
                }}>
                    {msg.text}
                </div>
            )}

            {/* LOAN APPLICATION FORM */}
            {showApply && (
                <div className={styles.tableContainer} style={{
                    background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)',
                    borderRadius: '16px', padding: '28px'
                }}>
                    <h2 className={styles.tableTitle} style={{ marginBottom: '20px' }}>Apply for a New Loan</h2>
                    <form onSubmit={handleApply} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loan Type</label>
                            <select
                                value={form.loanType}
                                onChange={e => setForm({ ...form, loanType: e.target.value })}
                                style={{
                                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#E2E8F0',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="PERSONAL">Personal Loan</option>
                                <option value="HOME">Home Loan</option>
                                <option value="VEHICLE">Vehicle Loan</option>
                                <option value="EDUCATION">Education Loan</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested Amount (₹)</label>
                            <input
                                type="number" value={form.requestedAmount} required min="1000"
                                onChange={e => setForm({ ...form, requestedAmount: e.target.value })}
                                placeholder="e.g. 500000"
                                style={{
                                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#E2E8F0',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tenure (Months)</label>
                            <input
                                type="number" value={form.tenureMonths} required min="1" max="360"
                                onChange={e => setForm({ ...form, tenureMonths: e.target.value })}
                                placeholder="e.g. 36"
                                style={{
                                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#E2E8F0',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desired Rate (%) <span style={{ color: '#64748B' }}>Optional</span></label>
                            <input
                                type="number" value={form.annualRate} step="0.01" min="0" max="30"
                                onChange={e => setForm({ ...form, annualRate: e.target.value })}
                                placeholder="10.5 (auto if empty)"
                                style={{
                                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#E2E8F0',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px', marginTop: '8px' }}>
                            <button type="submit" disabled={applying} className={styles.btnPrimary} style={{ flex: 1, justifyContent: 'center' }}>
                                {applying ? 'Submitting...' : 'Submit Loan Application'}
                            </button>
                            <button type="button" className={styles.btnSecondary} onClick={() => setShowApply(false)} style={{ flex: 0.4, justifyContent: 'center' }}>Cancel</button>
                        </div>
                    </form>
                    <p style={{ color: '#64748B', fontSize: '12px', marginTop: '12px' }}>
                        Your application will be reviewed by the Loan Manager. The rate may be adjusted during review.
                    </p>
                </div>
            )}

            {/* KPI ROW */}
            <div className={styles.cardsRow}>
                <div className={styles.summaryCard} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
                    <div className={styles.cardLabel}>ACTIVE LOANS</div>
                    <div className={styles.cardAmount}>{activeLoans.length}</div>
                    <div className={styles.cardDetail} style={{ fontSize: '12px' }}>Currently active / disbursed</div>
                </div>
                <div className={styles.summaryCard} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
                    <div className={styles.cardLabel}>TOTAL OUTSTANDING</div>
                    <div className={styles.cardAmount} style={{ fontSize: '28px' }}>{formatINR(totalOutstanding)}</div>
                    <div className={styles.cardDetail} style={{ fontSize: '12px' }}>Principal remaining</div>
                </div>
                <div className={styles.summaryCard} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
                    <div className={styles.cardLabel}>
                        {overdueEmis.length > 0 ? 'OVERDUE EMIs' : 'PENDING APPS'}
                    </div>
                    <div className={styles.cardAmount} style={{ color: overdueEmis.length > 0 ? '#F87171' : '#38BDF8' }}>
                        {overdueEmis.length > 0 ? overdueEmis.length : pendingLoans.length}
                    </div>
                    <div className={styles.cardDetail} style={{ fontSize: '12px' }}>
                        {overdueEmis.length > 0 ? 'Require immediate attention' : 'Awaiting review/approval'}
                    </div>
                </div>
            </div>

            {/* LOAN APPLICATIONS TABLE */}
            <div className={styles.tableContainer} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
                <h2 className={styles.tableTitle}>Loan Applications</h2>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>LOAN TYPE</th>
                            <th>AMOUNT</th>
                            <th>TENURE</th>
                            <th>RATE</th>
                            <th>APPLIED ON</th>
                            <th>OUTSTANDING</th>
                            <th>STATUS</th>
                            <th>EMI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loans.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0', color: '#64748B' }}>
                                    You have no loan applications yet. Click "Apply for Loan" above to get started.
                                </td>
                            </tr>
                        ) : loans.map((loan, i) => {
                            const nextEmi = loan.LOAN_ACCOUNT_ID ? getNextDueEmi(loan.LOAN_ACCOUNT_ID) : null;
                            const isExpanded = expandedLoan === loan.LOAN_APP_ID;
                            const loanEmis = loan.LOAN_ACCOUNT_ID ? getEmisForLoan(loan.LOAN_ACCOUNT_ID) : [];

                            return (
                                <tr key={loan.LOAN_APP_ID || i}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{loan.LOAN_TYPE}</div>
                                        {loan.LOAN_ACCOUNT_ID && (
                                            <div style={{ fontFamily: 'DM Mono', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                                {loan.LOAN_ACCOUNT_ID}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontFamily: 'DM Mono' }}>{formatINR(loan.REQUESTED_AMOUNT)}</td>
                                    <td>{loan.TENURE_MONTHS} Mo</td>
                                    <td style={{ color: '#FBBF24' }}>{loan.ANNUAL_RATE}%</td>
                                    <td>{formatDate(loan.APPLIED_AT)}</td>
                                    <td style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>
                                        {loan.OUTSTANDING_PRINCIPAL != null ? formatINR(loan.OUTSTANDING_PRINCIPAL) : '—'}
                                    </td>
                                    <td><StatusBadge status={loan.APP_STATUS} /></td>
                                    <td>
                                        {nextEmi ? (
                                            <div style={{ fontSize: '12px' }}>
                                                <div style={{ fontWeight: 600, color: nextEmi.STATUS === 'OVERDUE' ? '#F87171' : '#E2E8F0' }}>
                                                    {formatINR(nextEmi.EMI_AMOUNT)}
                                                </div>
                                                <div style={{ color: '#64748B', marginTop: '2px' }}>
                                                    Due: {formatDate(nextEmi.DUE_DATE)}
                                                </div>
                                            </div>
                                        ) : loan.LOAN_ACCOUNT_ID && loanEmis.length > 0 ? (
                                            <span style={{ fontSize: '11px', color: '#10B981' }}>All Paid</span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#64748B' }}>—</span>
                                        )}
                                        {loanEmis.length > 0 && (
                                            <button
                                                onClick={() => setExpandedLoan(isExpanded ? null : loan.LOAN_APP_ID)}
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#60A5FA',
                                                    cursor: 'pointer', fontSize: '11px', marginTop: '4px', padding: 0,
                                                    textDecoration: 'underline'
                                                }}
                                            >
                                                {isExpanded ? 'Hide Schedule' : 'View Schedule'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* EXPANDED EMI SCHEDULE */}
            {expandedLoan && (() => {
                const loan = loans.find(l => l.LOAN_APP_ID === expandedLoan);
                if (!loan?.LOAN_ACCOUNT_ID) return null;
                const loanEmis = getEmisForLoan(loan.LOAN_ACCOUNT_ID);
                if (loanEmis.length === 0) return null;

                const paidCount = loanEmis.filter(e => e.STATUS === 'PAID').length;
                const progress = Math.round((paidCount / loanEmis.length) * 100);

                return (
                    <div className={styles.tableContainer} style={{
                        background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)',
                        borderRadius: '16px'
                    }}>
                        <div className={styles.tableHeader}>
                            <h2 className={styles.tableTitle}>
                                EMI Schedule — {loan.LOAN_TYPE} ({loan.LOAN_ACCOUNT_ID})
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '120px', height: '6px', background: 'rgba(255,255,255,0.08)',
                                    borderRadius: '3px', overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${progress}%`, height: '100%',
                                        background: 'linear-gradient(90deg, #34D399, #10B981)',
                                        borderRadius: '3px', transition: 'width 0.5s'
                                    }} />
                                </div>
                                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                                    {paidCount}/{loanEmis.length} paid ({progress}%)
                                </span>
                            </div>
                        </div>
                        <table className={styles.txnTable}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>DUE DATE</th>
                                    <th>EMI AMOUNT</th>
                                    <th>PRINCIPAL</th>
                                    <th>INTEREST</th>
                                    <th>BALANCE</th>
                                    <th>PENALTY</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loanEmis.map((emi, i) => (
                                    <tr key={emi.EMI_ID || i}>
                                        <td style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>{emi.EMI_NUMBER}</td>
                                        <td>{formatDate(emi.DUE_DATE)}</td>
                                        <td style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{formatINR(emi.EMI_AMOUNT)}</td>
                                        <td style={{ fontFamily: 'DM Mono', fontSize: '13px' }}>{formatINR(emi.PRINCIPAL_COMPONENT)}</td>
                                        <td style={{ fontFamily: 'DM Mono', fontSize: '13px', color: '#FBBF24' }}>{formatINR(emi.INTEREST_COMPONENT)}</td>
                                        <td style={{ fontFamily: 'DM Mono', fontSize: '13px' }}>{formatINR(emi.CLOSING_BALANCE)}</td>
                                        <td style={{ color: emi.PENALTY_AMOUNT > 0 ? '#F87171' : '#64748B', fontSize: '13px' }}>
                                            {emi.PENALTY_AMOUNT > 0 ? formatINR(emi.PENALTY_AMOUNT) : '—'}
                                        </td>
                                        <td><StatusBadge status={emi.STATUS} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })()}
        </div>
    );
}
