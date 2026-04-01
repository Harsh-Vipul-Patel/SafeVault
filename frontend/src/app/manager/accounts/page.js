'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function AccountLifecycle() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [success, setSuccess] = useState(null);

    // Modal state for Freeze/Unfreeze OTP & Reason
    const [modalConfig, setModalConfig] = useState(null);
    const [otp, setOtp] = useState('');
    const [reason, setReason] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [modalError, setModalError] = useState('');

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const initiateStatusChange = (accountId, newStatus) => {
        if (newStatus === 'FROZEN' || newStatus === 'ACTIVE') {
            setModalConfig({ accountId, newStatus });
            setOtp('');
            setReason('');
            setOtpSent(false);
            setModalError('');
        } else {
            handleStatusChange(accountId, newStatus, 'Status changed by manager', null);
        }
    };

    const sendOTP = async () => {
        if (!reason.trim()) {
            setModalError('A reason must be provided before generating the OTP.');
            return;
        }
        setModalError('');
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/otp/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    purpose: 'ACCOUNT_STATUS_CHANGE', 
                    forManager: true 
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
            setOtpSent(true);
            setSuccess('OTP sent to your manager email successfully.');
        } catch (err) {
            setModalError(err.message);
        }
    };

    const submitStatusChangeWithOTP = async () => {
        if (!reason.trim()) {
            setModalError('A reason must be provided.');
            return;
        }
        if (!otp.trim()) {
            setModalError('OTP is required.');
            return;
        }
        await handleStatusChange(modalConfig.accountId, modalConfig.newStatus, reason, otp);
    };

    const handleStatusChange = async (accountId, newStatus, changeReason, otpCode) => {
        setActionLoading(accountId);
        setSuccess(null);
        setError(null);
        setModalConfig(null);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/accounts/${accountId}/status`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ newStatus, reason: changeReason, otpCode })
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));

                // Catch general Account Closure Error formats
                if (newStatus === 'CLOSED' && errorData.message && errorData.message.toLowerCase().includes('account closure')) {
                    setModalConfig({ 
                        type: 'CLOSURE_ERROR', 
                        newStatus: 'CLOSED',
                        message: errorData.message, 
                        balance: errorData.balance,
                        code: errorData.code
                    });
                    return;
                }

                // Fallback catch for BALANCE_NOT_ZERO legacy checks
                if (errorData.code === 'BALANCE_NOT_ZERO' || (errorData.message && errorData.message.includes('Balance must be zero'))) {
                    setModalConfig({ 
                        type: 'CLOSURE_ERROR', 
                        newStatus: 'CLOSED', // keep compatible with some checks 
                        message: errorData.message || 'Account closure rejected: Balance must be zero.', 
                        balance: errorData.balance,
                        code: 'BALANCE_NOT_ZERO'
                    });
                    return;
                }
                throw new Error(errorData.message || 'Status change failed');
            }
            const data = await res.json();
            setSuccess(data.message);
            await fetchAccounts();
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const statusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#3DD68C';
            case 'FROZEN': return '#5B9BFF';
            case 'CLOSED': return '#FF4A4A';
            case 'DORMANT': return '#FFAB6E';
            default: return 'var(--muted)';
        }
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Account Lifecycle Management</div>
                    <div className={styles.headerSubtitle}>Freeze, Close, or Update account statuses — all changes are audited in Oracle</div>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ color: '#3DD68C', fontSize: '13px', padding: '12px 16px', background: 'rgba(61,214,140,0.1)', borderRadius: '8px', marginBottom: '16px' }}>{success}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1.2fr 1.5fr 1fr 1fr 0.8fr 1.5fr' }}>
                        <div>ACCOUNT ID</div>
                        <div>CUSTOMER</div>
                        <div>TYPE</div>
                        <div>BALANCE</div>
                        <div>STATUS</div>
                        <div style={{ textAlign: 'right' }}>ACTIONS</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading accounts from Oracle...</div>
                    ) : accounts.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No accounts found for this branch.</div>
                    ) : accounts.map((a) => (
                        <div className={styles.tdRow} key={a.ACCOUNT_ID} style={{ gridTemplateColumns: '1.2fr 1.5fr 1fr 1fr 0.8fr 1.5fr' }}>
                            <div className={styles.idMono}>{a.ACCOUNT_ID}</div>
                            <div>{a.CUSTOMER_NAME}</div>
                            <div style={{ fontSize: '12px' }}>{a.TYPE_NAME}</div>
                            <div className={styles.tdAmount}>₹ {Number(a.BALANCE).toLocaleString('en-IN')}</div>
                            <div><span style={{ color: statusColor(a.STATUS), fontWeight: 600, fontSize: '12px' }}>{a.STATUS}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                {actionLoading === a.ACCOUNT_ID ? (
                                    <span style={{ fontSize: '12px', color: 'var(--gold2)' }}>Updating...</span>
                                ) : (
                                    <>
                                        {a.STATUS !== 'ACTIVE' && (
                                            <button className={styles.btnApprove} style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => initiateStatusChange(a.ACCOUNT_ID, 'ACTIVE')}>
                                                {a.STATUS === 'FROZEN' ? 'UNFREEZE' : 'ACTIVATE'}
                                            </button>
                                        )}
                                        {a.STATUS !== 'FROZEN' && a.STATUS !== 'CLOSED' && (
                                            <button className={styles.btnReject} style={{ padding: '6px 10px', fontSize: '11px', borderColor: '#5B9BFF', color: '#5B9BFF' }} onClick={() => initiateStatusChange(a.ACCOUNT_ID, 'FROZEN')}>FREEZE</button>
                                        )}
                                        {a.STATUS !== 'CLOSED' && (
                                            <button className={styles.btnReject} style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => initiateStatusChange(a.ACCOUNT_ID, 'CLOSED')}>CLOSE</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* OTP Modal & Error Modal */}
            {modalConfig && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    {modalConfig.type === 'CLOSURE_ERROR' ? (
                        <div className={styles.panel} style={{ background: '#1E293B', padding: '32px', width: '400px', borderRadius: '12px', color: '#F8FAFC' }}>
                            <h3 style={{ marginBottom: '16px', color: '#FF4A4A' }}>Account Closure Failed</h3>
                            <p style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
                                {modalConfig.message || 'Account closure rejected: Balance must be zero.'}
                            </p>
                            {(modalConfig.code === 'BALANCE_NOT_ZERO' || (modalConfig.balance !== undefined && modalConfig.balance !== null && Number(modalConfig.balance) > 0)) && (
                                <>
                                    <p style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '8px' }}>
                                        The account currently has a balance of Rs.{Number(modalConfig.balance || 0).toLocaleString('en-IN')}.
                                    </p>
                                    <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px' }}>
                                        Please transfer or withdraw all funds before closing.
                                    </p>
                                </>
                            )}
                            <button 
                                onClick={() => setModalConfig(null)} 
                                style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    ) : (
                        <div className={styles.panel} style={{ background: '#1E293B', padding: '32px', width: '400px', borderRadius: '12px', color: '#F8FAFC' }}>
                            <h3 style={{ marginBottom: '16px' }}>Authenticate {modalConfig.newStatus === 'FROZEN' ? 'Freeze' : 'Unfreeze'} Action</h3>
                            <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px' }}>
                                This high-risk action requires Manager Authentication. Generate and verify your OTP to proceed.
                            </p>

                            {modalError && <div style={{ color: '#F87171', fontSize: '13px', marginBottom: '16px' }}>{modalError}</div>}

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#CBD5E1' }}>Reason for {modalConfig.newStatus === 'FROZEN' ? 'Freezing' : 'Unfreezing'}</label>
                                <input 
                                    value={reason} 
                                    onChange={e => setReason(e.target.value)} 
                                    disabled={otpSent}
                                    style={{ width: '100%', padding: '10px', background: '#0F172A', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                                    placeholder="Enter reason for audit"
                                />
                            </div>

                            {!otpSent ? (
                                <button onClick={sendOTP} className={styles.btnApprove} style={{ width: '100%', padding: '12px', marginBottom: '16px' }}>Generate Manager OTP</button>
                            ) : (
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#CBD5E1' }}>Enter 6-Digit Manager OTP (Sent to Email)</label>
                                    <input 
                                        value={otp} 
                                        onChange={e => setOtp(e.target.value)} 
                                        maxLength={6}
                                        style={{ width: '100%', padding: '10px', background: '#0F172A', border: '1px solid #334155', borderRadius: '6px', color: '#FFF', letterSpacing: '4px', textAlign: 'center', fontSize: '18px' }}
                                        placeholder="000000"
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => setModalConfig(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                <button 
                                    onClick={submitStatusChangeWithOTP} 
                                    disabled={!otpSent}
                                    style={{ flex: 1, padding: '10px', background: otpSent ? '#3B82F6' : '#1E3A8A', color: '#FFF', border: 'none', borderRadius: '6px', cursor: otpSent ? 'pointer' : 'not-allowed' }}
                                >
                                    Confirm Action
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
