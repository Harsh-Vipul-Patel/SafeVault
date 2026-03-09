'use client';
import { useState, useEffect } from 'react';
import styles from '../internal/page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
  if (n === null || n === undefined) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ExternalTransfer() {
  const [accounts, setAccounts] = useState([]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [mode, setMode] = useState('NEFT');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAccts, setLoadingAccts] = useState(true);
  const [message, setMessage] = useState(null);

  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    let timer;
    if (showOtp && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && showOtp) {
      setMessage({ type: 'error', text: 'OTP has expired. Please cancel and request a new one.' });
    }
    return () => clearInterval(timer);
  }, [showOtp, timeLeft]);

  useEffect(() => {
    fetch(`${API}/api/customer/accounts`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(data => {
        const accts = data.accounts || [];
        setAccounts(accts);
        if (accts.length > 0) {
          setFromAccountId(accts[0].ACCOUNT_ID || accts[0].account_id);
        }
        setLoadingAccts(false);
      })
      .catch(() => setLoadingAccts(false));
  }, []);

  const handleTransfer = async () => {
    if (!fromAccountId || !toAccount || !ifsc || !amount || Number(amount) <= 0) {
      setMessage({ type: 'error', text: 'All fields are required with valid values.' });
      return;
    }

    // Before actual transfer, request OTP
    setLoading(true); setMessage(null);
    try {
      const res = await fetch(`${API}/api/otp/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ purpose: 'TRANSACTION' })
      });
      const data = await res.json();
      if (res.ok) {
        setShowOtp(true);
        setOtpCode('');
        setTimeLeft(60);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to request OTP.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network connection failed.' });
    }
    setLoading(false);
  };

  const submitTransfer = async () => {
    if (!otpCode || otpCode.length < 6) {
      setMessage({ type: 'error', text: 'Please enter a valid 6-digit OTP.' });
      return;
    }
    setOtpLoading(true); setMessage(null);
    try {
      const res = await fetch(`${API}/api/customer/transfer/external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ fromAccountId, toAccount, ifsc, mode, amount: Number(amount), otpCode })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `✓ Transfer Queued! Awaiting Manager Approval.  REF: ${data.ref}` });
        setAmount(''); setToAccount(''); setIfsc('');
        setShowOtp(false);
      } else {
        let errorTxt = data.message || 'Transfer initiation failed.';
        if (data.attemptsLeft !== undefined) {
          errorTxt += ` (Attempts remaining: ${data.attemptsLeft})`;
          if (data.attemptsLeft === 0) {
            setShowOtp(false);
          }
        }
        setMessage({ type: 'error', text: errorTxt });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network connection failed. Is the backend running?' });
    }
    setOtpLoading(false);
  };

  const selectedAcc = accounts.find(a => (a.ACCOUNT_ID || a.account_id) === fromAccountId);

  return (
    <div className={styles.pageWrap}>
      <h1 className={styles.pageTitle}>External Transfer (NEFT / RTGS / IMPS)</h1>
      <p className={styles.pageSubtitle}>Transfer to other banks · Calls Oracle <code>sp_initiate_external_transfer</code></p>

      <div className={styles.formPanel}>
        <div className={styles.formGroup}>
          <label>From Account (Debit)</label>
          {loadingAccts ? (
            <div className={styles.loadingText}>Loading your accounts…</div>
          ) : (
            <select
              className={styles.input}
              value={fromAccountId}
              onChange={e => setFromAccountId(e.target.value)}
            >
              {accounts.map(acc => {
                const id = acc.ACCOUNT_ID || acc.account_id;
                const type = acc.TYPE_NAME || acc.type_name || 'Account';
                const bal = acc.BALANCE || acc.balance;
                return (
                  <option key={id} value={id}>
                    {type} — {id} ({formatINR(bal)})
                  </option>
                );
              })}
              {accounts.length === 0 && <option>No accounts found</option>}
            </select>
          )}
          {selectedAcc && (
            <div className={styles.balanceHint}>
              Available: <strong>{formatINR(selectedAcc.BALANCE || selectedAcc.balance)}</strong>
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>Transfer Mode</label>
          <select className={styles.input} value={mode} onChange={e => setMode(e.target.value)}>
            <option value="NEFT">NEFT (Standard Clearing)</option>
            <option value="RTGS">RTGS (Instant Settlement &gt;= ₹2 Lakhs)</option>
            <option value="IMPS">IMPS (24/7 Instant &lt;= ₹5 Lakhs)</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>Beneficiary IFSC Code</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. HDFC0001234"
            value={ifsc}
            onChange={e => setIfsc(e.target.value.toUpperCase())}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Beneficiary Account Number</label>
          <input
            type="text"
            className={styles.input}
            placeholder="e.g. 50100XXXXXXX"
            value={toAccount}
            onChange={e => setToAccount(e.target.value)}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Amount (INR)</label>
          <input
            type="number"
            className={styles.inputAmount}
            placeholder="₹ 0.00"
            value={amount}
            min="1"
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        <div className={styles.infoBox}>
          ⚠ External transfers are queued and require Branch Manager approval before settlement.
        </div>

        {message && (
          <div className={`${styles.message} ${message.type === 'error' ? styles.msgError : styles.msgSuccess}`}>
            {message.text}
          </div>
        )}

        <button className={styles.btnSubmit} onClick={handleTransfer} disabled={loading || loadingAccts}>
          {loading ? 'PROCESSING…' : 'INITIATE EXTERNAL TRANSFER ➔'}
        </button>
      </div>

      {showOtp && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Security Verification</h2>
            <p className={styles.modalText}>
              We've sent a One-Time Password (OTP) to your registered email address to verify this transaction.
            </p>
            <div className={styles.formGroup}>
              <label>Enter 6-digit OTP</label>
              <input
                type="text"
                maxLength={6}
                className={styles.otpInput}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="------"
                autoFocus
                disabled={timeLeft === 0}
              />
            </div>

            <div style={{ textAlign: 'center', marginBottom: '15px', color: timeLeft > 10 ? '#EAB308' : '#EF4444', fontWeight: 'bold', fontSize: '14px' }}>
              {timeLeft > 0 ? `⏰ Time remaining: ${timeLeft}s` : '❌ OTP Expired'}
            </div>

            {message && message.type === 'error' && (
              <div className={styles.msgError} style={{ padding: '8px', fontSize: '12px' }}>{message.text}</div>
            )}
            <div className={styles.btnGroup}>
              <button className={styles.btnCancel} onClick={() => { setShowOtp(false); setMessage(null); }}>CANCEL</button>
              <button className={styles.btnSubmit} style={{ marginTop: 0, flex: 2 }} onClick={submitTransfer} disabled={otpLoading || otpCode.length < 6 || timeLeft === 0}>
                {otpLoading ? 'VERIFYING...' : 'VERIFY & TRANSFER'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
