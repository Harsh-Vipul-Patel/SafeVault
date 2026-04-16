'use client';
import { useState, useEffect } from 'react';
import styles from '../loan-pages.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => localStorage.getItem('suraksha_token');

export default function ApplicationTracking() {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionStatus, setActionStatus] = useState({ id: null, loading: false, message: '' });

    // Edit Terms modal state
    const [editModal, setEditModal] = useState(null); // { id, requestedAmount, annualRate }
    const [editSaving, setEditSaving] = useState(false);

    useEffect(() => { fetchLoans(); }, []);

    const fetchLoans = async () => {
        try {
            const res = await fetch(`${API}/api/loan-manager/reports/portfolio`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLoans(data.loans || []);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        setActionStatus({ id, loading: true, message: '' });
        try {
            const res = await fetch(`${API}/api/loan-manager/application/${id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ status: newStatus, note: 'Status updated by Manager' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setActionStatus({ id, loading: false, message: 'Updated ✓' });
            fetchLoans();
            setTimeout(() => setActionStatus({ id: null }), 3000);
        } catch (err) {
            setActionStatus({ id, loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setActionStatus({ id: null }), 5000);
        }
    };

    const handleGenerateEmi = async (appId, loanAccountId, app) => {
        setActionStatus({ id: appId + '_emi', loading: true, message: '' });
        try {
            const res = await fetch(`${API}/api/loan-manager/emi/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    loanAccountId: loanAccountId,
                    principal: app.OUTSTANDING_PRINCIPAL || app.REQUESTED_AMOUNT,
                    annualRate: app.ANNUAL_RATE || 9.5,
                    tenureMonths: app.TENURE_MONTHS || 12
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setActionStatus({ id: appId + '_emi', loading: false, message: 'EMI Schedule Generated ✓' });
            fetchLoans();
            setTimeout(() => setActionStatus({ id: null }), 3000);
        } catch (err) {
            setActionStatus({ id: appId + '_emi', loading: false, message: 'Error: ' + err.message });
            setTimeout(() => setActionStatus({ id: null }), 5000);
        }
    };

    const handleEditTerms = (loan) => {
        setEditModal({
            id: loan.LOAN_APP_ID,
            requestedAmount: loan.OUTSTANDING_PRINCIPAL || loan.REQUESTED_AMOUNT || '',
            annualRate: loan.ANNUAL_RATE || ''
        });
    };

    const handleSaveTerms = async (e) => {
        e.preventDefault();
        setEditSaving(true);
        try {
            const res = await fetch(`${API}/api/loan-manager/application/${editModal.id}/terms`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    requestedAmount: editModal.requestedAmount,
                    annualRate: editModal.annualRate
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setEditModal(null);
            fetchLoans();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setEditSaving(false);
        }
    };

    if (loading) return <div style={{ color: 'var(--cream)' }}>Loading applications...</div>;

    const inputStyle = {
        width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
        color: '#E2E8F0', fontSize: '14px', outline: 'none'
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Application Tracking</h1>
                    <p className={styles.pageSubtitle}>Review, edit terms, and update loan applications</p>
                </div>
            </div>

            {/* EDIT TERMS MODAL */}
            {editModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '16px', padding: '32px', width: '420px',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
                    }}>
                        <h2 style={{ color: '#D4A843', fontSize: '20px', marginBottom: '6px' }}>Edit Loan Terms</h2>
                        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '24px' }}>
                            Adjust the sanctioned amount and interest rate before approval.
                            Only editable in RECEIVED or UNDER_REVIEW state.
                        </p>
                        <form onSubmit={handleSaveTerms} style={{ display: 'grid', gap: '16px' }}>
                            <div>
                                <label style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                                    Sanctioned Amount (₹)
                                </label>
                                <input
                                    type="number" min="1000" step="1" required
                                    value={editModal.requestedAmount}
                                    onChange={e => setEditModal({ ...editModal, requestedAmount: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                                    Annual Interest Rate (%)
                                </label>
                                <input
                                    type="number" min="1" max="30" step="0.01" required
                                    value={editModal.annualRate}
                                    onChange={e => setEditModal({ ...editModal, annualRate: e.target.value })}
                                    style={inputStyle}
                                />
                                <p style={{ color: '#475569', fontSize: '11px', marginTop: '4px' }}>Standard rates: Personal 12–18% · Home 8.5–11% · Vehicle 9–12% · Education 8–12%</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="submit" disabled={editSaving}
                                    style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg, #1e40af, #3b82f6)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                                    {editSaving ? 'Saving...' : 'Save Terms'}
                                </button>
                                <button type="button" onClick={() => setEditModal(null)}
                                    style={{ flex: 1, padding: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94A3B8', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className={styles.section}>
                <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>App ID</th>
                                <th>Customer</th>
                                <th>Details</th>
                                <th>Rate / Tenure</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map((l) => (
                                <tr key={l.LOAN_APP_ID}>
                                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                        APP-{l.LOAN_APP_ID.substring(0, 8).toUpperCase()}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{l.CUSTOMER_NAME}</td>
                                    <td>
                                        <div style={{ color: 'var(--cream2)', fontWeight: 600 }}>{l.LOAN_TYPE}</div>
                                        <div style={{ color: '#94A3B8', fontSize: '12px' }}>
                                            ₹{(l.OUTSTANDING_PRINCIPAL || l.REQUESTED_AMOUNT || 0).toLocaleString('en-IN')}
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#94A3B8' }}>
                                        <div style={{ color: '#FBBF24', fontWeight: 600 }}>{l.ANNUAL_RATE}%</div>
                                        <div>{l.TENURE_MONTHS} months</div>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${styles['status_' + l.APP_STATUS]}`}>
                                            {l.APP_STATUS}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {/* Edit terms — only when not yet approved */}
                                            {['RECEIVED', 'UNDER_REVIEW'].includes(l.APP_STATUS) && (
                                                <button
                                                    onClick={() => handleEditTerms(l)}
                                                    style={{ padding: '5px 10px', fontSize: '11px', background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>
                                                    ✏ Edit Terms
                                                </button>
                                            )}

                                            {l.APP_STATUS === 'RECEIVED' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'UNDER_REVIEW')}
                                                    className={styles.submitBtn}
                                                    style={{ padding: '5px 10px', fontSize: '11px', background: 'rgba(255,152,0,0.2)', color: '#FF9800', boxShadow: 'none' }}>
                                                    Start Review
                                                </button>
                                            )}
                                            {l.APP_STATUS === 'UNDER_REVIEW' && (
                                                <>
                                                    <button
                                                        onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'APPROVED')}
                                                        className={styles.submitBtn}
                                                        style={{ padding: '5px 10px', fontSize: '11px', boxShadow: 'none' }}>
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatusUpdate(l.LOAN_APP_ID, 'REJECTED')}
                                                        className={styles.submitBtn}
                                                        style={{ padding: '5px 10px', fontSize: '11px', background: 'rgba(244,67,54,0.2)', color: '#F44336', boxShadow: 'none' }}>
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                            {l.APP_STATUS === 'APPROVED' && (
                                                <span style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                                                    EMI auto-generated on disburse
                                                </span>
                                            )}
                                            {/* Recovery: DISBURSED but no EMI — rare edge case */}
                                            {l.APP_STATUS === 'DISBURSED' && l.LOAN_ACCOUNT_ID && (
                                                <button
                                                    onClick={() => handleGenerateEmi(l.LOAN_APP_ID, l.LOAN_ACCOUNT_ID, l)}
                                                    className={styles.submitBtn}
                                                    style={{ padding: '5px 10px', fontSize: '11px', background: 'rgba(156,163,175,0.15)', color: '#9CA3AF', boxShadow: 'none' }}>
                                                    ↻ Recover EMI
                                                </button>
                                            )}

                                            {(actionStatus.id === l.LOAN_APP_ID || actionStatus.id === l.LOAN_APP_ID + '_emi') && (
                                                <span style={{ fontSize: '11px', color: actionStatus.message?.includes('Error') ? '#F44336' : '#4CAF50', alignSelf: 'center' }}>
                                                    {actionStatus.message || 'Processing...'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {loans.length === 0 && (
                                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No applications found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
