'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CustomerProfile() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Password change state
    const [showPwdForm, setShowPwdForm] = useState(false);
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdMsg, setPwdMsg] = useState(null);

    // Form Sub-states
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState('');

    useEffect(() => {
        fetch(`${API}/api/customer/profile`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        })
            .then(r => r.json())
            .then(data => {
                if (data.profile) setProfile(data.profile);
                else setError(data.message || 'Could not load profile.');
                setLoading(false);
            })
            .catch(() => {
                setError('Network error. Is the backend running?');
                setLoading(false);
            });
    }, []);

    const handleChangePassword = async (e) => {
        e.preventDefault();

        // Step 1: Request OTP
        if (!otpSent) {
            if (newPwd !== confirmPwd) {
                setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
                return;
            }
            if (newPwd.length < 8) {
                setPwdMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
                return;
            }
            setPwdLoading(true); setPwdMsg(null);
            try {
                const res = await fetch(`${API}/api/otp/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                    body: JSON.stringify({ purpose: 'PROFILE_UPDATE' })
                });
                const data = await res.json();
                if (res.ok) {
                    setOtpSent(true);
                    setPwdMsg({ type: 'success', text: 'OTP sent to your email. Please enter it below.' });
                } else {
                    setPwdMsg({ type: 'error', text: data.message || 'Failed to request OTP.' });
                }
            } catch {
                setPwdMsg({ type: 'error', text: 'Network error. Please try again.' });
            }
            setPwdLoading(false);
            return;
        }

        // Step 2: Verify & Update
        if (!otpCode || otpCode.length < 6) {
            setPwdMsg({ type: 'error', text: 'Please enter a valid 6-digit OTP.' });
            return;
        }
        setPwdLoading(true); setPwdMsg(null);
        try {
            const res = await fetch(`${API}/api/customer/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd, otpCode })
            });
            const data = await res.json();
            if (res.ok) {
                setPwdMsg({ type: 'success', text: '✓ Password updated successfully.' });
                setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
                setOtpCode(''); setOtpSent(false);
                setShowPwdForm(false);
            } else {
                setPwdMsg({ type: 'error', text: data.message || 'Failed to change password.' });
            }
        } catch {
            setPwdMsg({ type: 'error', text: 'Network error. Please try again.' });
        }
        setPwdLoading(false);
    };

    if (loading) return (
        <div className={styles.pageWrap}>
            <div className={styles.loadingState}>Loading profile from Oracle…</div>
        </div>
    );

    const p = profile;
    const kycVerified = (p?.KYC_STATUS || p?.kyc_status) === 'VERIFIED';

    return (
        <div className={styles.pageWrap}>
            <h1 className={styles.pageTitle}>Profile & Security</h1>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <div className={styles.grid}>
                {/* Personal Information */}
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>Personal Information</h2>
                    {p ? (
                        <div className={styles.infoList}>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Full Name</span>
                                <span className={styles.value}>{p.FULL_NAME || p.full_name}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Customer ID</span>
                                <span className={styles.valueMono}>{p.CUSTOMER_ID || p.customer_id}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Username</span>
                                <span className={styles.valueMono}>{p.USERNAME || p.username}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Email Address</span>
                                <span className={styles.value}>{p.EMAIL || p.email}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Mobile Number</span>
                                <span className={styles.value}>{p.PHONE || p.phone}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Date of Birth</span>
                                <span className={styles.value}>
                                    {p.DATE_OF_BIRTH || p.date_of_birth
                                        ? new Date(p.DATE_OF_BIRTH || p.date_of_birth).toLocaleDateString('en-IN')
                                        : '—'}
                                </span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>PAN Number</span>
                                <span className={styles.valueMono}>{p.PAN_NUMBER || p.pan_number || '—'}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Address</span>
                                <span className={styles.value}>
                                    {[p.ADDRESS || p.address, p.CITY || p.city, p.STATE || p.state]
                                        .filter(Boolean).join(', ') || '—'}
                                </span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>KYC Status</span>
                                <span className={kycVerified ? styles.badgeSuccess : styles.badgeWarning}>
                                    {(p.KYC_STATUS || p.kyc_status)} {kycVerified ? '✓' : '⚠'}
                                </span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Last Login</span>
                                <span className={styles.value}>
                                    {p.LAST_LOGIN || p.last_login
                                        ? new Date(p.LAST_LOGIN || p.last_login).toLocaleString('en-IN')
                                        : 'N/A'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#64748B', fontSize: '13px' }}>Profile data unavailable.</div>
                    )}
                </div>

                {/* Security Settings */}
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>Security Settings</h2>
                    <div className={styles.infoList}>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Password</span>
                            <span className={styles.value}>••••••••••</span>
                            <button className={styles.btnLink} onClick={() => { setShowPwdForm(!showPwdForm); setPwdMsg(null); }}>
                                {showPwdForm ? 'Cancel' : 'Change'}
                            </button>
                        </div>

                        {showPwdForm && (
                            <form onSubmit={handleChangePassword} className={styles.pwdForm}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Current Password</label>
                                    <input
                                        type="password"
                                        className={styles.formInput}
                                        value={currentPwd}
                                        onChange={e => setCurrentPwd(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>New Password (min 8 chars)</label>
                                    <input
                                        type="password"
                                        className={styles.formInput}
                                        value={newPwd}
                                        onChange={e => setNewPwd(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Confirm New Password</label>
                                    <input
                                        type="password"
                                        className={styles.formInput}
                                        value={confirmPwd}
                                        onChange={e => setConfirmPwd(e.target.value)}
                                        required
                                    />
                                </div>
                                {otpSent && (
                                    <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                                        <label className={styles.formLabel} style={{ color: '#EAB308' }}>Enter 6-digit OTP Sent to Email</label>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            className={styles.formInput}
                                            value={otpCode}
                                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                            placeholder="------"
                                            autoFocus
                                            required
                                            style={{ fontFamily: 'DM Mono', fontSize: '20px', letterSpacing: '8px', textAlign: 'center' }}
                                        />
                                    </div>
                                )}
                                {pwdMsg && (
                                    <div className={pwdMsg.type === 'error' ? styles.msgError : styles.msgSuccess}>
                                        {pwdMsg.text}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                    {otpSent && (
                                        <button type="button" className={styles.btnPrimary} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => setOtpSent(false)}>
                                            BACK
                                        </button>
                                    )}
                                    <button type="submit" className={styles.btnPrimary} style={{ flex: 1 }} disabled={pwdLoading}>
                                        {pwdLoading ? 'PROCESSING…' : (otpSent ? 'VERIFY & UPDATE PASSWORD' : 'CHANGE PASSWORD')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {pwdMsg && !showPwdForm && (
                            <div className={pwdMsg.type === 'error' ? styles.msgError : styles.msgSuccess}>
                                {pwdMsg.text}
                            </div>
                        )}

                        <div className={styles.infoRow}>
                            <span className={styles.label}>Two-Factor Authentication</span>
                            <span className={styles.value}>Enabled (SMS OTP)</span>
                            <button className={styles.btnLink}>Manage</button>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Active Sessions</span>
                            <span className={styles.value}>1 Current Session</span>
                            <button className={styles.btnLinkRed}>Revoke All</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
